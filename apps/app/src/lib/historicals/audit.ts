import { prisma } from "@/lib/prisma";
import type { HistoricalBudget } from "@prisma/client";

/**
 * Auditoría de calidad de datos de históricos (ver docs/tareas.md E.1).
 *
 * Detecta históricos sospechosos antes de que contaminen el RAG: duplicados
 * exactos, datos incompletos, extracción pobre y casos sin revisar hace
 * mucho tiempo. Pensado para que un admin pueda detectar y limpiar el
 * histórico de un tenant sin tener que revisar uno por uno.
 */

export type SuspiciousReason =
  | "DUPLICATE"
  | "INCOMPLETE_DATA"
  | "POOR_EXTRACTION"
  | "STALE_PENDING_REVIEW";

export const SUSPICIOUS_REASON_LABELS: Record<SuspiciousReason, string> = {
  DUPLICATE: "Duplicado exacto",
  INCOMPLETE_DATA: "Datos incompletos",
  POOR_EXTRACTION: "Extracción pobre",
  STALE_PENDING_REVIEW: "Sin revisar hace mucho",
};

export interface SuspiciousHistoricalItem {
  id: string;
  title: string;
  amount: number | null;
  createdAt: string;
}

export interface SuspiciousGroup {
  reason: SuspiciousReason;
  label: string;
  count: number;
  items: SuspiciousHistoricalItem[];
}

const MIN_RAW_TEXT_LENGTH = 200;
const STALE_PENDING_REVIEW_DAYS = 14;

/** Normaliza un string para comparación de duplicados: minúsculas, sin tildes, sin espacios extra. */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "");
}

function toItem(b: HistoricalBudget): SuspiciousHistoricalItem {
  return {
    id: b.id,
    title: b.title,
    amount: b.amount === null ? null : Number(b.amount),
    createdAt: b.createdAt.toISOString(),
  };
}

function isStructuredContentEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function findDuplicates(budgets: HistoricalBudget[]): HistoricalBudget[] {
  const groups = new Map<string, HistoricalBudget[]>();
  for (const b of budgets) {
    if (b.amount === null) continue; // sin monto no se puede comparar de forma confiable
    const key = `${normalize(b.title)}|${b.amount.toString()}|${normalize(b.location)}`;
    const group = groups.get(key) ?? [];
    group.push(b);
    groups.set(key, group);
  }

  const duplicates: HistoricalBudget[] = [];
  for (const group of groups.values()) {
    if (group.length > 1) duplicates.push(...group);
  }
  return duplicates;
}

function findIncomplete(budgets: HistoricalBudget[]): HistoricalBudget[] {
  return budgets.filter((b) => {
    let missing = 0;
    if (b.amount === null) missing += 1;
    if (!b.location) missing += 1;
    if (!b.client) missing += 1;
    if (!b.documentDate) missing += 1;
    if (isStructuredContentEmpty(b.structuredContent)) missing += 1;
    return missing >= 2;
  });
}

function findPoorExtraction(budgets: HistoricalBudget[]): HistoricalBudget[] {
  return budgets.filter((b) => (b.rawText ?? "").trim().length < MIN_RAW_TEXT_LENGTH);
}

function findStalePendingReview(budgets: HistoricalBudget[]): HistoricalBudget[] {
  const cutoff = Date.now() - STALE_PENDING_REVIEW_DAYS * 24 * 60 * 60 * 1000;
  return budgets.filter(
    (b) => b.status === "PENDING_REVIEW" && b.createdAt.getTime() < cutoff,
  );
}

/**
 * Trae todos los HistoricalBudget del tenant y los agrupa por tipo de
 * problema detectado. Por default excluye los ya marcados `auditReviewed`;
 * pasar `includeReviewed: true` para incluirlos también.
 */
export async function findSuspiciousHistoricals(
  tenantId: string,
  options?: { includeReviewed?: boolean },
): Promise<SuspiciousGroup[]> {
  const includeReviewed = options?.includeReviewed ?? false;

  const all = await prisma.historicalBudget.findMany({ where: { tenantId } });
  const budgets = includeReviewed ? all : all.filter((b) => !b.auditReviewed);

  const detectors: Array<{
    reason: SuspiciousReason;
    find: (budgets: HistoricalBudget[]) => HistoricalBudget[];
  }> = [
    { reason: "DUPLICATE", find: findDuplicates },
    { reason: "INCOMPLETE_DATA", find: findIncomplete },
    { reason: "POOR_EXTRACTION", find: findPoorExtraction },
    { reason: "STALE_PENDING_REVIEW", find: findStalePendingReview },
  ];

  const groups: SuspiciousGroup[] = [];
  for (const { reason, find } of detectors) {
    const matches = find(budgets);
    if (matches.length === 0) continue;
    groups.push({
      reason,
      label: SUSPICIOUS_REASON_LABELS[reason],
      count: matches.length,
      items: matches.map(toItem),
    });
  }

  return groups;
}
