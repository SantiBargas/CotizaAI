import { extractText, getDocumentProxy } from "unpdf";
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
  method: "service" | "unpdf";
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
      console.warn("Extracción remota falló; fallback a unpdf:", err);
    }
  }
  const text = await extractViaUnpdf(buffer);
  return { text, method: "unpdf" };
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

/** Extrae cajitas semánticas + metadata del texto crudo. */
export async function extractSemanticContent(
  rawText: string,
): Promise<SemanticExtraction> {
  const input = rawText.slice(0, MAX_EXTRACTION_INPUT_CHARS);
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
