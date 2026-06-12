import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { structuredContentSchema } from "@/types/budget";
import { ReviewForm } from "@/features/historicos/review-form";
import type { HistoricalBudgetDetail } from "@/features/historicos/types";

export const dynamic = "force-dynamic";

export default async function HistoricoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const { id } = await params;
  const b = await prisma.historicalBudget.findFirst({
    where: { id, tenantId: tenant.id },
    include: { _count: { select: { chunks: true } } },
  });
  if (!b) notFound();

  const structured = structuredContentSchema.safeParse(b.structuredContent);

  const budget: HistoricalBudgetDetail = {
    id: b.id,
    title: b.title,
    client: b.client,
    location: b.location,
    amount: b.amount === null ? null : Number(b.amount),
    currency: b.currency,
    documentDate: b.documentDate?.toISOString() ?? null,
    sourceFileName: b.sourceFileName,
    status: b.status,
    createdByAI: b.createdByAI,
    createdAt: b.createdAt.toISOString(),
    chunkCount: b._count.chunks,
    rawText: b.rawText,
    structuredContent: structured.success ? structured.data : null,
    hasSourceFile: Boolean(b.sourceFileUrl),
  };

  return <ReviewForm budget={budget} />;
}
