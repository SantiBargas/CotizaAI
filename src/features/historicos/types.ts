import type { HistoricalBudgetStatus } from "@prisma/client";
import type { StructuredContent } from "@/types/budget";

/** DTO serializable (Decimal → number, Date → ISO string) para la UI. */
export interface HistoricalBudgetListItem {
  id: string;
  title: string;
  client: string | null;
  location: string | null;
  amount: number | null;
  currency: string;
  documentDate: string | null;
  sourceFileName: string | null;
  status: HistoricalBudgetStatus;
  createdByAI: boolean;
  createdAt: string;
  chunkCount: number;
}

export interface HistoricalBudgetDetail extends HistoricalBudgetListItem {
  rawText: string | null;
  structuredContent: StructuredContent | null;
  hasSourceFile: boolean;
}

export const STATUS_LABELS: Record<HistoricalBudgetStatus, string> = {
  PENDING_REVIEW: "Pendiente de revisión",
  INDEXED: "Indexado",
  ARCHIVED: "Archivado",
};
