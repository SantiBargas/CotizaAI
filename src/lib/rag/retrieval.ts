import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  embedText,
  isEmbeddingConfigured,
  toPgVectorLiteral,
} from "@/lib/ai/embeddings";
import {
  adjustAmount,
  loadInflationIndices,
} from "@/lib/inflation";
import { formatMoney } from "@/lib/format";

/**
 * Retrieval RAG scopeado por tenant. Mejoras sobre ITZA aplicadas desde el
 * día 1:
 *  - Vectorial como DEFAULT (no opt-in), con prefiltro en Postgres (el orden
 *    por distancia coseno lo hace pgvector, no JS).
 *  - Fallback léxico automático y silencioso (sin key, sin columna vector,
 *    error de red → nunca rompe la generación).
 *  - Trazabilidad: devuelve los ids de históricos usados (ragSourceIds).
 *  - El monto se ajusta por inflación ANTES de entrar al prompt.
 */

const TOP_CHUNKS = 12; // chunks recuperados de pgvector
const TOP_BUDGETS = 3; // históricos que entran al prompt
const LEXICAL_POOL = 300; // chunks máximos a escorear en fallback léxico

export interface RagResult {
  contextText: string;
  sourceIds: string[];
  mode: "vectorial" | "lexico" | "none";
}

// ────────────────────────────────────────────────────────────────────────────
// Normalización y tokenización (modo léxico)
// ────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "para", "como", "con", "los", "las", "del", "que", "una", "uno", "unos",
  "unas", "por", "mas", "más", "este", "esta", "estos", "estas", "donde",
  "cual", "cuales", "quiero", "necesito", "hacer", "haceme", "generar",
  "genera", "presupuesto", "presupuestos", "cotizacion", "cotización",
  "cotizar", "precio", "precios", "cliente", "trabajo", "sobre", "favor",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function tokenWeight(token: string): number {
  if (token.length >= 10) return 4;
  if (token.length >= 7) return 3;
  if (token.length >= 5) return 2;
  return 1;
}

// ────────────────────────────────────────────────────────────────────────────
// Búsqueda vectorial (pgvector, SQL crudo, SIEMPRE filtrando tenantId)
// ────────────────────────────────────────────────────────────────────────────

interface ChunkHit {
  budgetId: string;
  content: string;
  score: number; // mayor = más relevante
}

async function vectorSearch(
  tenantId: string,
  query: string,
): Promise<ChunkHit[]> {
  const { embedding } = await embedText(query);
  const literal = toPgVectorLiteral(embedding);
  const rows = await prisma.$queryRaw<
    Array<{ budgetId: string; content: string; distance: number }>
  >(Prisma.sql`
    SELECT bc."budgetId", bc.content, (bc.embedding <=> ${literal}::vector) AS distance
    FROM "BudgetChunk" bc
    JOIN "HistoricalBudget" hb ON hb.id = bc."budgetId"
    WHERE bc."tenantId" = ${tenantId}::uuid
      AND bc.embedding IS NOT NULL
      AND hb.status = 'INDEXED'
    ORDER BY bc.embedding <=> ${literal}::vector
    LIMIT ${TOP_CHUNKS}
  `);
  return rows.map((r) => ({
    budgetId: r.budgetId,
    content: r.content,
    score: 1 - r.distance, // similitud coseno aproximada
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Búsqueda léxica (fallback, 100% disponible)
// ────────────────────────────────────────────────────────────────────────────

async function lexicalSearch(
  tenantId: string,
  query: string,
): Promise<ChunkHit[]> {
  const tokens = tokenize(query);
  const chunks = await prisma.budgetChunk.findMany({
    where: { tenantId, budget: { status: "INDEXED" } },
    select: { budgetId: true, content: true },
    take: LEXICAL_POOL,
    orderBy: { createdAt: "desc" },
  });
  if (tokens.length === 0) {
    // Sin tokens útiles: devolver los más recientes.
    return chunks
      .slice(0, TOP_CHUNKS)
      .map((c) => ({ budgetId: c.budgetId, content: c.content, score: 0 }));
  }
  const scored: ChunkHit[] = chunks.map((c) => {
    const haystack = normalize(c.content);
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += tokenWeight(token);
    }
    return { budgetId: c.budgetId, content: c.content, score };
  });
  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_CHUNKS);
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construye el contexto RAG para el prompt: top históricos del tenant con
 * monto actualizado por inflación. Si la DB o los embeddings fallan, degrada
 * (vectorial → léxico → contexto vacío) sin lanzar.
 */
export async function buildRagContext(params: {
  tenantId: string;
  query: string;
  country: string;
  currency: string;
}): Promise<RagResult> {
  let hits: ChunkHit[] = [];
  let mode: RagResult["mode"] = "none";

  try {
    if (isEmbeddingConfigured()) {
      try {
        hits = await vectorSearch(params.tenantId, params.query);
        mode = "vectorial";
      } catch (err) {
        console.warn("Búsqueda vectorial falló; fallback léxico:", err);
      }
    }
    if (hits.length === 0) {
      hits = await lexicalSearch(params.tenantId, params.query);
      mode = hits.length > 0 ? "lexico" : mode;
    }
  } catch (err) {
    // DB caída: la generación sigue sin RAG.
    console.error("RAG retrieval falló por completo:", err);
    return { contextText: "", sourceIds: [], mode: "none" };
  }

  if (hits.length === 0) {
    return { contextText: "", sourceIds: [], mode: "none" };
  }

  // Agrupar por histórico y rankear por mejor score de sus chunks.
  const byBudget = new Map<string, { score: number; chunks: string[] }>();
  for (const hit of hits) {
    const entry = byBudget.get(hit.budgetId) ?? { score: -Infinity, chunks: [] };
    entry.score = Math.max(entry.score, hit.score);
    entry.chunks.push(hit.content);
    byBudget.set(hit.budgetId, entry);
  }
  const topBudgetIds = [...byBudget.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, TOP_BUDGETS)
    .map(([id]) => id);

  const [budgets, indices] = await Promise.all([
    prisma.historicalBudget.findMany({
      where: { id: { in: topBudgetIds }, tenantId: params.tenantId },
      select: {
        id: true,
        title: true,
        client: true,
        location: true,
        amount: true,
        currency: true,
        documentDate: true,
      },
    }),
    loadInflationIndices(params.country, params.currency),
  ]);

  const blocks: string[] = [];
  for (const id of topBudgetIds) {
    const budget = budgets.find((b) => b.id === id);
    if (!budget) continue;
    const chunks = byBudget.get(id)?.chunks ?? [];

    let amountLine = "Monto: no informado";
    if (budget.amount !== null) {
      const original = Number(budget.amount);
      if (budget.currency === params.currency) {
        const { adjusted, adjustment } = adjustAmount(
          original,
          budget.documentDate,
          indices,
        );
        amountLine =
          adjustment && adjustment.monthsApplied > 0
            ? `Monto original: ${formatMoney(original, budget.currency)} (${budget.documentDate?.toISOString().slice(0, 10) ?? "s/f"}) → ` +
              `ACTUALIZADO POR INFLACIÓN A HOY: ${formatMoney(adjusted, budget.currency)}. ` +
              "USAR ESTE VALOR ACTUALIZADO como referencia de precio real actual."
            : `Monto: ${formatMoney(original, budget.currency)}`;
      } else {
        amountLine = `Monto: ${formatMoney(original, budget.currency)} (sin ajuste por inflación, moneda ${budget.currency})`;
      }
    }

    blocks.push(
      [
        `### Histórico: ${budget.title}`,
        budget.client ? `Cliente: ${budget.client}` : null,
        budget.location ? `Ubicación: ${budget.location}` : null,
        amountLine,
        "",
        chunks.join("\n\n"),
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    );
  }

  return {
    contextText: blocks.join("\n\n---\n\n"),
    sourceIds: topBudgetIds,
    mode,
  };
}
