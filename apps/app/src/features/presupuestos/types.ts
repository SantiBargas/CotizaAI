import type { GeneratedBudgetStatus } from "@prisma/client";
import type { GeneratedBudgetPayload } from "@/types/budget";

/** DTO serializable de un presupuesto generado para la UI. */
export interface GeneratedBudgetListItem {
  id: string;
  title: string;
  totalAmount: number | null;
  currency: string;
  status: GeneratedBudgetStatus;
  createdAt: string;
}

export interface GeneratedBudgetDetail extends GeneratedBudgetListItem {
  requestPrompt: string;
  content: GeneratedBudgetPayload;
  ragSourceIds: string[];
}

export const BUDGET_STATUS_LABELS: Record<GeneratedBudgetStatus, string> = {
  DRAFT: "Borrador",
  FINAL: "Final",
};
