import type { HistoricalBudget, Prisma, Tenant, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadTenantFile, isStorageConfigured } from "@/lib/storage";
import { extractFileText, extractSemanticContent } from "@/lib/pdf/extract";
import { availableProviders } from "@/lib/ai/providers";
import { recordUsage } from "@/lib/ai/usage";
import { logAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";

export class EmptyPdfTextError extends Error {
  constructor() {
    super(
      "No se pudo extraer texto de este archivo (¿es un PDF escaneado sin texto?). " +
        "Probá exportarlo de nuevo desde el original, o completá los datos a mano.",
    );
    this.name = "EmptyPdfTextError";
  }
}

/**
 * Pipeline compartido de ingesta de un PDF histórico (upload manual o import
 * desde Google Drive): storage → extracción de texto → cajitas semánticas con
 * LLM (best-effort) → HistoricalBudget en PENDING_REVIEW + auditoría.
 */
export async function ingestPdfHistorical(params: {
  tenant: Tenant;
  user: User | null;
  fileName: string;
  buffer: ArrayBuffer;
  source: "upload" | "google-drive";
}): Promise<HistoricalBudget> {
  const { tenant, user, fileName, buffer, source } = params;

  const contentType = fileName.toLowerCase().endsWith(".docx")
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : fileName.toLowerCase().endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf";

  // 1. Storage (opcional: sin configurar seguimos — el texto alcanza para RAG).
  let sourceFileUrl: string | null = null;
  if (isStorageConfigured()) {
    sourceFileUrl = await uploadTenantFile(
      tenant.id,
      fileName,
      buffer,
      contentType,
    );
  }

  // 2. Extracción de texto: PDF (remoto → fallback unpdf), .docx o .xlsx.
  const { text: rawText, method } = await extractFileText(buffer, fileName);
  if (!rawText.trim()) throw new EmptyPdfTextError();

  // 3. Extracción semántica con LLM rápido (best-effort).
  let structuredContent: Prisma.InputJsonValue | undefined;
  let title = fileName.replace(/\.(pdf|docx|xlsx)$/i, "");
  let client: string | null = null;
  let location: string | null = null;
  let amount: number | null = null;
  let currency = tenant.defaultCurrency;
  let documentDate: Date | null = null;
  let createdByAI = false;

  if (availableProviders().length > 0) {
    try {
      const semantic = await extractSemanticContent(rawText);
      structuredContent = semantic.structured;
      title = semantic.metadata.titulo ?? title;
      client = semantic.metadata.cliente;
      location = semantic.metadata.ubicacion;
      amount = semantic.metadata.montoTotal;
      currency = semantic.metadata.moneda ?? currency;
      documentDate = semantic.metadata.fechaDocumento
        ? new Date(semantic.metadata.fechaDocumento)
        : null;
      createdByAI = true;
      await recordUsage({
        tenantId: tenant.id,
        userId: user?.id,
        operation: "EXTRACTION",
        provider: semantic.provider,
        model: semantic.model,
        usage: semantic.usage,
      });
    } catch (err) {
      // Sin extracción semántica el histórico queda con texto crudo.
      logWarn("pdf.ingest.semanticExtraction", err);
    }
  }

  const budget = await prisma.historicalBudget.create({
    data: {
      tenantId: tenant.id,
      title,
      client,
      location,
      amount,
      currency,
      documentDate,
      sourceFileUrl,
      sourceFileName: fileName,
      rawText,
      structuredContent,
      createdByAI,
      status: "PENDING_REVIEW",
    },
  });

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user?.id,
    action: "HISTORICAL_UPLOADED",
    payload: { budgetId: budget.id, fileName, method, source },
  });

  return budget;
}
