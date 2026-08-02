import { prisma } from "@/lib/prisma";
import type { UsageOperation } from "@prisma/client";
import type { TokenUsage } from "@/lib/ai/providers";
import { logError } from "@/lib/logger";

/**
 * Tracking de consumo de IA por tenant (analítica de costos + límites por plan).
 * Se registra después de cada operación; si falla, NO rompe la operación
 * principal (best-effort con log).
 */
export async function recordUsage(params: {
  tenantId: string;
  userId?: string | null;
  operation: UsageOperation;
  provider: string;
  model: string;
  usage: TokenUsage;
}): Promise<void> {
  try {
    await prisma.usageRecord.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        operation: params.operation,
        provider: params.provider,
        model: params.model,
        promptTokens: params.usage.promptTokens,
        completionTokens: params.usage.completionTokens,
        totalTokens: params.usage.totalTokens,
      },
    });
  } catch (err) {
    logError("ai.usage.recordUsage", err);
  }
}
