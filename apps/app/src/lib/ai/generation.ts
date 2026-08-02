import type { CompanyProfile, Tenant } from "@prisma/client";
import {
  availableProvidersForTenant,
  callWithTool,
  isProviderId,
  type ProviderId,
  type TokenUsage,
  type ToolDefinition,
} from "@/lib/ai/providers";
import { prisma } from "@/lib/prisma";
import { buildRagContext, type RagResult } from "@/lib/rag/retrieval";
import {
  generatedBudgetPayloadSchema,
  type BudgetBlock,
  type GeneratedBudgetPayload,
} from "@/types/budget";

/**
 * Generación de presupuestos con tool-calling (Fase 2).
 *
 * El LLM SIEMPRE responde invocando el tool `emitir_presupuesto` con bloques
 * tipados; una capa de normalización repara variantes comunes (tipo→type,
 * text/content→texto, etc., heredada del aprendizaje de ITZA) y Zod valida el
 * resultado final. Nada de parsear JSON de texto libre.
 */

// JSON Schema plano (compatible Gemini + OpenAI-compat: sin discriminated
// unions; los campos por tipo de bloque son opcionales y se validan después).
const GENERATION_TOOL: ToolDefinition = {
  name: "emitir_presupuesto",
  description:
    "Emite el presupuesto generado, estructurado en bloques tipados listos para renderizar en un documento.",
  parameters: {
    type: "object",
    properties: {
      titulo: {
        type: "string",
        description: "Título del presupuesto (corto y profesional).",
      },
      ubicacion: {
        type: "string",
        description: "Ubicación/dirección del trabajo, si el pedido la menciona.",
      },
      fecha: {
        type: "string",
        description: "Fecha del presupuesto en formato YYYY-MM-DD.",
      },
      concepto: {
        type: "string",
        description: "Resumen muy corto del servicio cotizado (3-6 palabras).",
      },
      cotizacionTotal: {
        type: "number",
        description: "Monto total cotizado (solo número, sin símbolo).",
      },
      moneda: {
        type: "string",
        description: "Moneda del total (ARS, USD...).",
      },
      formaPago: {
        type: "string",
        description: "Forma de pago propuesta (ej: 50% anticipo, saldo contra entrega).",
      },
      validezDias: {
        type: "number",
        description: "Días de validez de la oferta.",
      },
      cuerpo: {
        type: "array",
        description:
          "Bloques del cuerpo en orden. type: titulo | subtitulo | parrafo | lista | tabla. " +
          "Para titulo/subtitulo/parrafo usar `texto`; para lista usar `items`; " +
          "para tabla usar `encabezados` y `filas`.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["titulo", "subtitulo", "parrafo", "lista", "tabla"],
            },
            texto: { type: "string" },
            items: { type: "array", items: { type: "string" } },
            encabezados: { type: "array", items: { type: "string" } },
            filas: {
              type: "array",
              items: { type: "array", items: { type: "string" } },
            },
          },
          required: ["type"],
        },
      },
    },
    required: ["titulo", "cuerpo"],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Normalización defensiva del payload del tool
// ────────────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x != null ? String(x) : ""))
    .filter((x) => x.trim() !== "");
}

interface RawBlock {
  type?: unknown;
  tipo?: unknown;
  texto?: unknown;
  text?: unknown;
  content?: unknown;
  body?: unknown;
  items?: unknown;
  encabezados?: unknown;
  headers?: unknown;
  filas?: unknown;
  rows?: unknown;
}

/**
 * Heredado de ITZA: el LLM a veces cuela sintaxis markdown (`**negrita**`,
 * `__subrayado__`, backticks, `#`/`##` de heading) dentro de campos que se
 * renderizan como texto plano en el Word/PDF final. Se remueve solo la
 * sintaxis, nunca el contenido.
 */
function limpiarMarkdown(texto: string): string {
  return texto
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1")
    .replace(/(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, "$1")
    .replace(/`{1,3}([^`]+?)`{1,3}/g, "$1")
    .trim();
}

function limpiarMarkdownBloque(b: BudgetBlock): BudgetBlock {
  switch (b.type) {
    case "titulo":
    case "subtitulo":
    case "parrafo":
      return { ...b, texto: limpiarMarkdown(b.texto) };
    case "lista":
      return { ...b, items: b.items.map(limpiarMarkdown) };
    case "tabla":
      return {
        ...b,
        encabezados: b.encabezados.map(limpiarMarkdown),
        filas: b.filas.map((fila) => fila.map(limpiarMarkdown)),
      };
    case "imagen":
      return b.leyenda ? { ...b, leyenda: limpiarMarkdown(b.leyenda) } : b;
  }
}

/** Copia local mínima de `normalize` de `src/lib/rag/retrieval.ts` (evita ciclo). */
function normalizeTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heredado de ITZA: el LLM a veces repite el título del presupuesto como un
 * bloque titulo/subtitulo dentro del cuerpo, duplicándolo en el documento.
 */
function esEcoCabecera(b: BudgetBlock, tituloNormalizado: string): boolean {
  if (b.type !== "titulo" && b.type !== "subtitulo") return false;
  return normalizeTexto(b.texto) === tituloNormalizado;
}

function normalizeBlock(raw: RawBlock): BudgetBlock | null {
  const type = str(raw.type) ?? str(raw.tipo);
  const texto = str(raw.texto) ?? str(raw.text) ?? str(raw.content) ?? str(raw.body);
  switch (type) {
    case "titulo":
    case "subtitulo":
    case "parrafo":
      return texto ? { type, texto } : null;
    case "lista": {
      const items = strArray(raw.items);
      return items.length > 0 ? { type: "lista", items } : null;
    }
    case "tabla": {
      const encabezados = strArray(raw.encabezados ?? raw.headers);
      const filasRaw = raw.filas ?? raw.rows;
      const filas = Array.isArray(filasRaw)
        ? filasRaw.map((f) => strArray(f)).filter((f) => f.length > 0)
        : [];
      return encabezados.length > 0 && filas.length > 0
        ? { type: "tabla", encabezados, filas }
        : null;
    }
    case "imagen":
      // La IA nunca genera bloques de imagen (no puede producir una imagen
      // real); si lo intenta, se descarta. Los agrega el usuario en el editor.
      return null;
    default:
      // Bloque desconocido pero con texto → degradar a párrafo.
      return texto ? { type: "parrafo", texto } : null;
  }
}

interface RawGenerationArgs {
  titulo?: unknown;
  ubicacion?: unknown;
  fecha?: unknown;
  concepto?: unknown;
  cotizacionTotal?: unknown;
  moneda?: unknown;
  formaPago?: unknown;
  validezDias?: unknown;
  cuerpo?: unknown;
}

/**
 * Filtro defensivo heredado de ITZA: aunque el prompt lo prohíbe, a veces el
 * LLM cuela bloques que imitan una firma (sección "FIRMA", matrículas
 * inventadas, líneas para rubricar). Las firmas reales se cargan en /perfil y
 * se insertan al exportar — estos bloques se eliminan.
 */
function esBloqueFirmaIa(b: BudgetBlock): boolean {
  if (b.type === "titulo" || b.type === "subtitulo") {
    return /^firmas?(\s+y\s+aclaraci[oó]n(es)?)?$/i.test(b.texto.trim());
  }
  if (b.type === "parrafo") {
    const t = b.texto.trim();
    if (/_{4,}/.test(t)) return true; // línea para rubricar (en cualquier parte del párrafo)
    if (/^firma\b/i.test(t)) return true;
    if (/\bfirma y aclaraci[oó]n\b/i.test(t)) return true;
    // "Matrícula: XXXX", "Mat. 24882", "Mat: 1-1809-5", con/sin punto y dos puntos
    if (/\bmatr[ií]cula\b/i.test(t)) return true;
    if (/\bmat\.?\s*:?\s*\d/i.test(t)) return true;
    // nombre + título profesional + matrícula en el mismo párrafo
    if (
      /\b(ingenier[oa]|arquitect[oa]|t[eé]cnic[oa]|contador[a]?|abogad[oa])\b/i.test(t) &&
      /\b(mat\.?|matr[ií]cula)\b/i.test(t)
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeGenerationPayload(
  args: unknown,
  fallbackCurrency: string,
): GeneratedBudgetPayload {
  const raw = (args ?? {}) as RawGenerationArgs;
  const titulo = str(raw.titulo) ?? "Presupuesto";
  const tituloNormalizado = normalizeTexto(titulo);
  const cuerpoRaw = Array.isArray(raw.cuerpo) ? (raw.cuerpo as RawBlock[]) : [];
  const cuerpo = cuerpoRaw
    .map(normalizeBlock)
    .filter((b): b is BudgetBlock => b !== null)
    .map(limpiarMarkdownBloque)
    .filter((b) => !esBloqueFirmaIa(b))
    .filter((b) => !esEcoCabecera(b, tituloNormalizado));

  const validez = num(raw.validezDias);
  return generatedBudgetPayloadSchema.parse({
    titulo,
    ubicacion: str(raw.ubicacion),
    fecha: str(raw.fecha),
    concepto: str(raw.concepto),
    cotizacionTotal: num(raw.cotizacionTotal),
    moneda: str(raw.moneda)?.toUpperCase() ?? fallbackCurrency,
    formaPago: str(raw.formaPago),
    validezDias: validez !== null ? Math.round(validez) : null,
    cuerpo,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt maestro + orquestación
// ────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  tenant: Tenant,
  profile: CompanyProfile | null,
  ragContext: string,
): string {
  const parts: string[] = [
    "Sos un asistente experto en redactar presupuestos y cotizaciones comerciales profesionales.",
    `Trabajás para la empresa "${tenant.name}".`,
  ];
  if (profile?.industry) {
    parts.push(`Rubro de la empresa: ${profile.industry}.`);
  }
  if (profile?.industryPrompt) {
    parts.push(`Perfil del rubro (instrucciones de la empresa):\n${profile.industryPrompt}`);
  }
  if (profile?.tone) {
    parts.push(`Tono de redacción requerido: ${profile.tone}.`);
  }
  if (profile?.defaultUnits) {
    parts.push(`Unidades de medida habituales: ${profile.defaultUnits}.`);
  }
  parts.push(
    [
      "REGLAS:",
      "- Respondé SIEMPRE invocando el tool `emitir_presupuesto`.",
      "- Estructurá el cuerpo con bloques: titulo, subtitulo, parrafo, lista, tabla.",
      "- Usá tablas para ítems cotizados con cantidades y precios.",
      "- Si el pedido menciona una ubicación/dirección, completá `ubicacion`. Si no la menciona, dejala vacía (no la inventes).",
      "- Completá `fecha` con la fecha de hoy en formato YYYY-MM-DD si no se especifica otra.",
      "- Completá `concepto` con un resumen de 3 a 6 palabras del servicio cotizado (ej. \"Mensura de lote urbano\").",
      "- NO incluyas bloques de firma ni datos bancarios inventados.",
      "- NO generes bloques de tipo imagen: no podés producir imágenes reales; esos bloques los agrega el usuario manualmente en el editor.",
      "- Los precios deben ser coherentes con los históricos de referencia (ya ajustados por inflación a valor de hoy).",
      "- Si el pedido no da suficiente detalle, asumí lo razonable para el rubro y dejalo explícito en el texto.",
      `- Moneda default: ${tenant.defaultCurrency}.`,
    ].join("\n"),
  );
  if (ragContext) {
    parts.push(
      "PRESUPUESTOS HISTÓRICOS DE REFERENCIA (de esta misma empresa; usalos como base de precios, alcance y estilo):\n\n" +
        ragContext,
    );
  } else {
    parts.push(
      "No hay históricos de referencia disponibles: generá el presupuesto desde el conocimiento del rubro, siendo conservador con los precios.",
    );
  }
  return parts.join("\n\n");
}

export interface GenerationOutcome {
  payload: GeneratedBudgetPayload;
  rag: RagResult;
  usage: TokenUsage;
  provider: string;
  model: string;
}

/** Errores típicos de "contexto/request demasiado grande" de proveedores de
 *  IA (free tier de Groq/Cerebras/GitHub Models, límites de tokens, etc.). */
const CONTEXT_TOO_LARGE_PATTERN = /too large|context length|token|payload too|413/i;

function isContextTooLargeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return CONTEXT_TOO_LARGE_PATTERN.test(message);
}

/** Orquesta RAG + tool-calling y devuelve el presupuesto normalizado. Si el
 *  proveedor rechaza el request por exceder su límite de tokens, reintenta
 *  UNA vez con menos históricos RAG en el contexto antes de propagar el error. */
export async function generateBudgetPayload(params: {
  tenant: Tenant;
  profile: CompanyProfile | null;
  requestPrompt: string;
  /** Proveedor elegido explícitamente por el usuario en el composer (pisa el
   *  default del tenant si está disponible). */
  provider?: ProviderId;
}): Promise<GenerationOutcome> {
  const [allowedProviders, aiConfig] = await Promise.all([
    availableProvidersForTenant(params.tenant.id),
    prisma.tenantAiConfig.findUnique({
      where: { tenantId: params.tenant.id },
      select: { defaultGeneration: true },
    }),
  ]);
  const preferred = aiConfig?.defaultGeneration;
  const provider: ProviderId | undefined =
    params.provider && allowedProviders.includes(params.provider)
      ? params.provider
      : preferred && isProviderId(preferred)
        ? preferred
        : undefined;

  async function attempt(maxBudgets?: number): Promise<GenerationOutcome> {
    const rag = await buildRagContext({
      tenantId: params.tenant.id,
      query: params.requestPrompt,
      country: params.tenant.country,
      currency: params.tenant.defaultCurrency,
      maxBudgets,
    });

    const result = await callWithTool(
      [
        {
          role: "system",
          content: buildSystemPrompt(params.tenant, params.profile, rag.contextText),
        },
        { role: "user", content: params.requestPrompt },
      ],
      GENERATION_TOOL,
      { allowedProviders, provider },
    );

    const payload = normalizeGenerationPayload(
      result.args,
      params.tenant.defaultCurrency,
    );

    return {
      payload,
      rag,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
    };
  }

  try {
    return await attempt();
  } catch (err) {
    if (!isContextTooLargeError(err)) throw err;
    console.warn(
      "generateBudgetPayload: contexto demasiado grande para el proveedor, reintentando con 1 histórico RAG.",
      err,
    );
    return await attempt(1);
  }
}
