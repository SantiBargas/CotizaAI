import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  embedText,
  isEmbeddingConfigured,
  toPgVectorLiteral,
} from "@/lib/ai/embeddings";
import { recordUsage } from "@/lib/ai/usage";
import { buildBudgetChunks } from "@/lib/rag/chunking";
import { structuredContentSchema } from "@/types/budget";
import { logWarn } from "@/lib/logger";

/**
 * Indexado de un histórico para RAG: regenera sus BudgetChunk y calcula los
 * embeddings (columna `embedding vector(768)` vía SQL crudo).
 *
 * Si los embeddings no están configurados o fallan, los chunks quedan sin
 * vector y el retrieval cae al modo léxico — el indexado NUNCA se rompe por
 * falta de IA (mismo principio de fallback que ITZA).
 */

export interface IndexResult {
  chunkCount: number;
  embeddedCount: number;
}

export async function reindexHistoricalBudget(
  tenantId: string,
  budgetId: string,
  userId?: string | null,
): Promise<IndexResult> {
  const budget = await prisma.historicalBudget.findFirst({
    where: { id: budgetId, tenantId },
  });
  if (!budget) throw new Error("Histórico no encontrado para este tenant.");

  const structuredParsed = structuredContentSchema.safeParse(
    budget.structuredContent,
  );

  const chunks = buildBudgetChunks({
    title: budget.title,
    client: budget.client,
    location: budget.location,
    structured: structuredParsed.success ? structuredParsed.data : null,
    rawText: budget.rawText,
  });

  // Regenerar chunks de cero (idempotente).
  await prisma.budgetChunk.deleteMany({ where: { budgetId, tenantId } });

  if (chunks.length === 0) return { chunkCount: 0, embeddedCount: 0 };

  const created = await prisma.$transaction(
    chunks.map((c) =>
      prisma.budgetChunk.create({
        data: {
          tenantId,
          budgetId,
          chunkIndex: c.chunkIndex,
          content: c.content,
        },
      }),
    ),
  );

  let embeddedCount = 0;
  if (isEmbeddingConfigured()) {
    let embedProvider = "";
    let embedModel = "";
    let estimatedTokens = 0;
    for (const chunk of created) {
      try {
        const { embedding, provider, model } = await embedText(chunk.content);
        embedProvider = provider;
        embedModel = model;
        estimatedTokens += Math.ceil(chunk.content.length / 4);
        await prisma.$executeRaw(
          Prisma.sql`UPDATE "BudgetChunk" SET embedding = ${toPgVectorLiteral(embedding)}::vector WHERE id = ${chunk.id}::uuid AND "tenantId" = ${tenantId}::uuid`,
        );
        embeddedCount += 1;
      } catch (err) {
        // Chunk sin vector → lo cubre el fallback léxico.
        logWarn("rag.indexing.embedChunk", err, { chunkId: chunk.id });
      }
    }
    if (embeddedCount > 0) {
      await recordUsage({
        tenantId,
        userId,
        operation: "EMBEDDING",
        provider: embedProvider,
        model: embedModel,
        usage: {
          promptTokens: estimatedTokens,
          completionTokens: 0,
          totalTokens: estimatedTokens,
        },
      });
    }
  }

  return { chunkCount: created.length, embeddedCount };
}
