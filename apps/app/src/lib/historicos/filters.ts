import type { HistoricalBudgetListItem } from "@/features/historicos/types";
import {
  adjustAmount,
  type InflationRateEntry,
} from "@/lib/inflation-calc";

export type HistoricosSortBy = "recent" | "amount-desc" | "amount-asc" | "name";
export type HistoricosGroupBy = "none" | "client" | "date";
export type HistoricosAmountField = "historical" | "adjusted";
export type HistoricosEmbeddingFilter = "all" | "with" | "without";
export type HistoricosDatePreset = "none" | "last30" | "thisYear";
export type FileType = "pdf" | "docx" | "xlsx" | "other";

export interface HistoricosFiltersState {
  query: string;
  /** "all" | HistoricalBudgetStatus (vista BD) | "imported" | "pending" (vista Drive). */
  status: string;
  currency: string; // "" = todas
  fileTypes: FileType[]; // [] = todos
  embedding: HistoricosEmbeddingFilter;
  amountField: HistoricosAmountField; // solo BD: histórico vs actualizado por inflación
  amountMin: string;
  amountMax: string;
  datePreset: HistoricosDatePreset;
  dateFrom: string;
  dateTo: string;
  sortBy: HistoricosSortBy;
  groupBy: HistoricosGroupBy;
}

export const DEFAULT_HISTORICOS_FILTERS: HistoricosFiltersState = {
  query: "",
  status: "all",
  currency: "",
  fileTypes: [],
  embedding: "all",
  amountField: "historical",
  amountMin: "",
  amountMax: "",
  datePreset: "none",
  dateFrom: "",
  dateTo: "",
  sortBy: "recent",
  groupBy: "none",
};

export function hasActiveFilters(f: HistoricosFiltersState): boolean {
  return (
    f.query.trim() !== "" ||
    f.status !== "all" ||
    f.currency !== "" ||
    f.fileTypes.length > 0 ||
    f.embedding !== "all" ||
    f.amountMin !== "" ||
    f.amountMax !== "" ||
    f.datePreset !== "none" ||
    f.dateFrom !== "" ||
    f.dateTo !== ""
  );
}

export function inferFileType(fileName: string | null): FileType {
  const lower = (fileName ?? "").toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return "other";
}

function dateWithinPreset(date: Date, preset: HistoricosDatePreset): boolean {
  if (preset === "none") return true;
  const now = new Date();
  if (preset === "last30") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return date >= thirtyDaysAgo && date <= now;
  }
  // thisYear
  return date.getFullYear() === now.getFullYear();
}

/** Filtra/ordena la vista BD (HistoricalBudget ya importados). `indices` se
 *  usa para calcular el monto actualizado por inflación cuando
 *  `amountField === "adjusted"`. */
export function filterHistoricalBudgets(
  items: HistoricalBudgetListItem[],
  f: HistoricosFiltersState,
  indices: InflationRateEntry[],
): HistoricalBudgetListItem[] {
  const q = f.query.trim().toLowerCase();
  const min = f.amountMin ? Number(f.amountMin) : null;
  const max = f.amountMax ? Number(f.amountMax) : null;
  const from = f.dateFrom ? new Date(f.dateFrom).getTime() : null;
  const to = f.dateTo ? new Date(f.dateTo).getTime() : null;

  function effectiveAmount(b: HistoricalBudgetListItem): number | null {
    if (b.amount === null) return null;
    if (f.amountField !== "adjusted") return b.amount;
    const docDate = b.documentDate ? new Date(b.documentDate) : null;
    return adjustAmount(b.amount, docDate, indices).adjusted;
  }

  const filtered = items.filter((b) => {
    if (
      q &&
      !b.title.toLowerCase().includes(q) &&
      !(b.client ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.status !== "all" && b.status !== f.status) return false;
    if (f.currency && b.currency !== f.currency) return false;
    if (
      f.fileTypes.length > 0 &&
      !f.fileTypes.includes(inferFileType(b.sourceFileName))
    ) {
      return false;
    }
    if (f.embedding === "with" && b.chunkCount === 0) return false;
    if (f.embedding === "without" && b.chunkCount > 0) return false;

    const amount = effectiveAmount(b);
    if (min !== null && (amount === null || amount < min)) return false;
    if (max !== null && (amount === null || amount > max)) return false;

    if (from !== null || to !== null) {
      if (!b.documentDate) return false;
      const t = new Date(b.documentDate).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
    } else if (f.datePreset !== "none") {
      if (!b.documentDate) return false;
      if (!dateWithinPreset(new Date(b.documentDate), f.datePreset)) {
        return false;
      }
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (f.sortBy) {
      case "amount-desc":
        return (effectiveAmount(b) ?? -Infinity) - (effectiveAmount(a) ?? -Infinity);
      case "amount-asc":
        return (effectiveAmount(a) ?? Infinity) - (effectiveAmount(b) ?? Infinity);
      case "name":
        return a.title.localeCompare(b.title, "es");
      case "recent":
      default:
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  });
}

export interface HistoricosGroup<T> {
  label: string;
  items: T[];
}

/** Agrupa una lista YA filtrada/ordenada de HistoricalBudget para la tabla BD. */
export function groupHistoricalBudgets(
  items: HistoricalBudgetListItem[],
  groupBy: HistoricosGroupBy,
): HistoricosGroup<HistoricalBudgetListItem>[] {
  if (groupBy === "none") return [{ label: "", items }];

  const groups = new Map<string, HistoricalBudgetListItem[]>();
  for (const item of items) {
    const key =
      groupBy === "client"
        ? (item.client?.trim() || "Sin cliente")
        : item.documentDate
          ? new Date(item.documentDate).toLocaleDateString("es-AR", {
              month: "long",
              year: "numeric",
            })
          : "Sin fecha";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}

export interface DriveFileFilterable {
  id: string;
  name: string;
  imported: boolean;
}

/** Filtra/ordena la vista Drive (archivos del árbol). Sin monto/moneda/fecha
 *  (Drive no expone esos campos hasta que se importa a BD). */
export function filterDriveFiles<T extends DriveFileFilterable>(
  items: T[],
  f: HistoricosFiltersState,
): T[] {
  const q = f.query.trim().toLowerCase();
  const filtered = items.filter((file) => {
    if (q && !file.name.toLowerCase().includes(q)) return false;
    if (f.status === "imported" && !file.imported) return false;
    if (f.status === "pending" && file.imported) return false;
    if (
      f.fileTypes.length > 0 &&
      !f.fileTypes.includes(inferFileType(file.name))
    ) {
      return false;
    }
    return true;
  });

  if (f.sortBy === "name") {
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  return filtered;
}
