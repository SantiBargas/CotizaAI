import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, notFound, requireTenantContext } from "@/lib/api";
import { reindexHistoricalBudget } from "@/lib/rag/indexing";
import { logAudit } from "@/lib/audit";

export const maxDuration = 120; // embeddings de varios chunks

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/historicos/[id]/index — aprueba la revisión humana: genera
 * chunks + embeddings y marca el histórico como INDEXED (entra al RAG).
 */
export async function POST(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    const { id } = await params;
    const budget = await prisma.historicalBudget.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!budget) return notFound("Histórico no encontrado.");

    const result = await reindexHistoricalBudget(tenant.id, id, user?.id);
    await prisma.historicalBudget.update({
      where: { id },
      data: { status: "INDEXED" },
    });

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "HISTORICAL_INDEXED",
      payload: { budgetId: id, ...result },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
