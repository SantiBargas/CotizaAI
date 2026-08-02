import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { getEnv } from "@/lib/env";
import {
  callWithTool,
  type TokenUsage,
  type ToolDefinition,
} from "@/lib/ai/providers";
import {
  extractedMetadataSchema,
  structuredContentSchema,
  type ExtractedMetadata,
  type StructuredContent,
} from "@/types/budget";
import { logWarn } from "@/lib/logger";

/**
 * Pipeline de extracción de PDF (Fase 1), replicando el diseño dual de ITZA:
 *
 *  1. Si hay `PDF_EXTRACT_SERVICE_URL` (microservicio tipo MarkItDown), se usa
 *     primero: devuelve markdown estructurado (mejor con tablas).
 *  2. Fallback local: `unpdf` (texto plano, sin dependencias nativas, corre en
 *     Vercel sin problemas).
 *  3. Con el texto crudo, un LLM rápido extrae "cajitas semánticas" + metadata
 *     vía tool-calling. Si no hay IA configurada, el histórico queda con el
 *     texto crudo y el usuario completa los campos a mano.
 *
 * El resultado SIEMPRE pasa por revisión humana antes de indexarse.
 */

export interface PdfTextResult {
  text: string;
  method: "service" | "unpdf" | "docx" | "xlsx";
}

export class UnsupportedFileTypeError extends Error {
  constructor(fileName: string) {
    super(`Formato de archivo no soportado: ${fileName}`);
    this.name = "UnsupportedFileTypeError";
  }
}

async function extractViaService(
  buffer: ArrayBuffer,
  fileName: string,
  serviceUrl: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: "application/pdf" }),
    fileName,
  );
  const res = await fetch(serviceUrl, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Servicio de extracción falló (${res.status})`);
  }
  const json = (await res.json()) as { markdown?: string; text?: string };
  const text = json.markdown ?? json.text ?? "";
  if (!text.trim()) throw new Error("Servicio de extracción devolvió vacío.");
  return text;
}

async function extractViaUnpdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Extrae texto del PDF: microservicio primero, fallback local. Nunca lanza
 *  por el camino remoto (degrada en silencio al local). */
export async function extractPdfText(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<PdfTextResult> {
  const env = getEnv();
  if (env.PDF_EXTRACT_SERVICE_URL) {
    try {
      const text = await extractViaService(
        buffer,
        fileName,
        env.PDF_EXTRACT_SERVICE_URL,
      );
      return { text, method: "service" };
    } catch (err) {
      logWarn("pdf.extract.remoteService", err);
    }
  }
  const text = await extractViaUnpdf(buffer);
  return { text, method: "unpdf" };
}

async function extractViaDocx(buffer: ArrayBuffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return value;
}

async function extractViaXlsx(buffer: ArrayBuffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const parts: string[] = [];
  workbook.eachSheet((sheet) => {
    parts.push(`--- Hoja: ${sheet.name} ---`);
    sheet.eachRow((row) => {
      const cells = (row.values as Array<string | number | undefined>)
        .slice(1) // ExcelJS usa índice 1-based; el 0 queda undefined
        .map((v) => (v === undefined || v === null ? "" : String(v)));
      parts.push(cells.join(" | "));
    });
  });
  return parts.join("\n");
}

/**
 * Extrae texto de un histórico sin importar el formato (PDF/.docx/.xlsx):
 * decide la vía por extensión del nombre de archivo. PDF usa el pipeline dual
 * existente (microservicio → unpdf); Word/Excel se leen localmente.
 */
export async function extractFileText(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<PdfTextResult> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) {
    return { text: await extractViaDocx(buffer), method: "docx" };
  }
  if (lower.endsWith(".xlsx")) {
    return { text: await extractViaXlsx(buffer), method: "xlsx" };
  }
  if (lower.endsWith(".pdf")) {
    return extractPdfText(buffer, fileName);
  }
  throw new UnsupportedFileTypeError(fileName);
}

// ────────────────────────────────────────────────────────────────────────────
// Extracción semántica (LLM rápido + tool-calling)
// ────────────────────────────────────────────────────────────────────────────

export interface SemanticExtraction {
  structured: StructuredContent;
  metadata: ExtractedMetadata;
  usage: TokenUsage;
  provider: string;
  model: string;
}

// JSON Schema escrito a mano (subset compatible con Gemini y OpenAI-compat).
const EXTRACTION_TOOL: ToolDefinition = {
  name: "registrar_extraccion",
  description:
    "Registra la información estructurada extraída de un presupuesto histórico en PDF.",
  parameters: {
    type: "object",
    properties: {
      titulo: {
        type: "string",
        description: "Título o asunto del presupuesto (corto).",
      },
      cliente: { type: "string", description: "Nombre del cliente, si figura." },
      ubicacion: {
        type: "string",
        description: "Ubicación/localidad del trabajo, si figura.",
      },
      montoTotal: {
        type: "number",
        description: "Monto total cotizado (solo el número).",
      },
      moneda: {
        type: "string",
        description: "Moneda del monto (ARS, USD, EUR...).",
      },
      fechaDocumento: {
        type: "string",
        description: "Fecha del documento en formato YYYY-MM-DD, si figura.",
      },
      resumen: {
        type: "string",
        description: "Resumen del trabajo cotizado en 2-3 oraciones.",
      },
      condicionesComerciales: {
        type: "array",
        items: { type: "string" },
        description: "Condiciones comerciales (forma de pago, validez, etc.).",
      },
      entregables: {
        type: "array",
        items: { type: "string" },
        description: "Entregables o productos finales prometidos.",
      },
      productosEquipos: {
        type: "array",
        items: { type: "string" },
        description: "Productos, materiales o equipos cotizados con su precio si figura.",
      },
      tareasDetalladas: {
        type: "array",
        items: { type: "string" },
        description: "Tareas o ítems de trabajo detallados con su precio si figura.",
      },
    },
    required: ["resumen"],
  },
};

const MAX_EXTRACTION_INPUT_CHARS = 30_000;
const CHUNK_TARGET_CHARS = 25_000;
const MAX_CHUNKS = 4;

interface RawExtractionArgs {
  titulo?: unknown;
  cliente?: unknown;
  ubicacion?: unknown;
  montoTotal?: unknown;
  moneda?: unknown;
  fechaDocumento?: unknown;
  resumen?: unknown;
  condicionesComerciales?: unknown;
  entregables?: unknown;
  productosEquipos?: unknown;
  tareasDetalladas?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Formato argentino: "1.234.567,89" → 1234567.89
    const cleaned = v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

/** Divide `rawText` en hasta `MAX_CHUNKS` trozos de ~`CHUNK_TARGET_CHARS`
 *  caracteres, cortando en el salto de párrafo (`\n\n`) más cercano al límite
 *  para no partir una oración a la mitad cuando es posible. */
function splitIntoChunks(rawText: string): string[] {
  if (rawText.length <= MAX_EXTRACTION_INPUT_CHARS) return [rawText];

  const chunks: string[] = [];
  let rest = rawText;

  while (rest.length > 0 && chunks.length < MAX_CHUNKS) {
    if (rest.length <= CHUNK_TARGET_CHARS) {
      chunks.push(rest);
      break;
    }

    // Buscamos el último \n\n dentro de una ventana razonable antes del
    // límite para cortar en un borde de párrafo, no a mitad de oración.
    const window = rest.slice(0, CHUNK_TARGET_CHARS);
    const lastBreak = window.lastIndexOf("\n\n");
    const cutoff = lastBreak > CHUNK_TARGET_CHARS * 0.5 ? lastBreak : CHUNK_TARGET_CHARS;

    chunks.push(rest.slice(0, cutoff));
    rest = rest.slice(cutoff).trimStart();
  }

  return chunks;
}

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** Mergea arrays de strings sin duplicar valores exactos, preservando orden. */
function mergeUnique(lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }
  return merged;
}

/** Corre la extracción semántica sobre un único chunk de texto (sin troceo). */
async function extractOneChunk(input: string): Promise<SemanticExtraction> {
  const result = await callWithTool(
    [
      {
        role: "system",
        content:
          "Sos un asistente experto en analizar presupuestos y cotizaciones comerciales. " +
          "Extraés información estructurada de presupuestos en PDF. " +
          "Respondé SIEMPRE invocando el tool con los datos extraídos. " +
          "Si un dato no figura en el documento, omitilo (no lo inventes).",
      },
      {
        role: "user",
        content: `Analizá este presupuesto y extraé su información:\n\n${input}`,
      },
    ],
    EXTRACTION_TOOL,
    { fast: true },
  );

  const raw = (result.args ?? {}) as RawExtractionArgs;

  const structured = structuredContentSchema.parse({
    resumen: asString(raw.resumen),
    condicionesComerciales: asStringArray(raw.condicionesComerciales),
    entregables: asStringArray(raw.entregables),
    productosEquipos: asStringArray(raw.productosEquipos),
    tareasDetalladas: asStringArray(raw.tareasDetalladas),
  });

  const metadata = extractedMetadataSchema.parse({
    titulo: asString(raw.titulo),
    cliente: asString(raw.cliente),
    ubicacion: asString(raw.ubicacion),
    montoTotal: asNumber(raw.montoTotal),
    moneda: asString(raw.moneda)?.toUpperCase() ?? null,
    fechaDocumento: asString(raw.fechaDocumento),
  });

  return {
    structured,
    metadata,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}

/** Extrae cajitas semánticas + metadata del texto crudo. Si el texto supera
 *  `MAX_EXTRACTION_INPUT_CHARS`, lo trocea en hasta `MAX_CHUNKS` chunks
 *  (en vez de truncar con `.slice()` y perder el resto del documento) y
 *  mergea los resultados de cada chunk. */
export async function extractSemanticContent(
  rawText: string,
): Promise<SemanticExtraction> {
  const chunks = splitIntoChunks(rawText);

  const results: SemanticExtraction[] = [];
  for (const chunk of chunks) {
    results.push(await extractOneChunk(chunk));
  }

  if (results.length === 1) return results[0];

  const merged = results.reduce((acc, cur) => ({
    structured: structuredContentSchema.parse({
      resumen: [acc.structured.resumen, cur.structured.resumen]
        .filter((s): s is string => Boolean(s))
        .join(". "),
      condicionesComerciales: mergeUnique([
        acc.structured.condicionesComerciales,
        cur.structured.condicionesComerciales,
      ]),
      entregables: mergeUnique([acc.structured.entregables, cur.structured.entregables]),
      productosEquipos: mergeUnique([
        acc.structured.productosEquipos,
        cur.structured.productosEquipos,
      ]),
      tareasDetalladas: mergeUnique([
        acc.structured.tareasDetalladas,
        cur.structured.tareasDetalladas,
      ]),
    }),
    metadata: extractedMetadataSchema.parse({
      titulo: acc.metadata.titulo ?? cur.metadata.titulo,
      cliente: acc.metadata.cliente ?? cur.metadata.cliente,
      ubicacion: acc.metadata.ubicacion ?? cur.metadata.ubicacion,
      montoTotal: acc.metadata.montoTotal ?? cur.metadata.montoTotal,
      moneda: acc.metadata.moneda ?? cur.metadata.moneda,
      fechaDocumento: acc.metadata.fechaDocumento ?? cur.metadata.fechaDocumento,
    }),
    usage: sumUsage(acc.usage, cur.usage),
    provider: acc.provider,
    model: acc.model,
  }));

  return merged;
}
