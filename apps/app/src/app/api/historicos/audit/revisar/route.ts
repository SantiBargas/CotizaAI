import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  revisado: z.boolean(),
});

/**
 * POST /api/historicos/audit/revisar — marca/desmarca en lote `auditReviewed`
 * para históricos del tenant de la sesión. Ver docs/tareas.md E.1.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos.");
    const { ids, revisado } = parsed.data;

    const result = await prisma.historicalBudget.updateMany({
      where: { id: { in: ids }, tenantId: tenant.id },
      data: { auditReviewed: revisado },
    });

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "HISTORICAL_AUDIT_REVIEWED",
      payload: { ids, revisado, count: result.count },
    });

    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return apiError(err);
  }
}
