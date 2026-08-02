import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantRole } from "@/lib/api";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/configuracion/cuenta — borra el tenant completo (I.3: política
 * de borrado de datos). Solo OWNER. Requiere `{ confirmacion: string }` en el
 * body, que tiene que ser EXACTAMENTE el nombre del tenant (`tenant.name`).
 *
 * Las cascadas (`onDelete: Cascade`) ya están configuradas en
 * prisma/schema.prisma para Membership, CompanyProfile, TenantAiConfig,
 * HistoricalBudget, BudgetChunk, IncompatibleFile, GeneratedBudget,
 * BudgetTemplate, UsageRecord, Subscription, TenantIntegration y AuditLog —
 * borrar el Tenant se lleva todo lo demás en una sola operación.
 *
 * NOTA UX: esta tarea deja el endpoint funcional pero SIN botón en la UI.
 * Un borrado de cuenta necesita su propio flujo de confirmación (modal,
 * doble-check, posible delay/cooldown) que queda fuera de alcance acá —
 * agregar esa UI en una tarea aparte antes de exponerlo a usuarios finales.
 */
const bodySchema = z.object({
  confirmacion: z.string().min(1),
});

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantRole(["OWNER"]);

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(
        "Escribí el nombre exacto de tu empresa para confirmar.",
      );
    }

    if (parsed.data.confirmacion !== tenant.name) {
      return badRequest(
        "Escribí el nombre exacto de tu empresa para confirmar.",
      );
    }

    const [
      historicalBudgetsCount,
      generatedBudgetsCount,
      membershipsCount,
    ] = await Promise.all([
      prisma.historicalBudget.count({ where: { tenantId: tenant.id } }),
      prisma.generatedBudget.count({ where: { tenantId: tenant.id } }),
      prisma.membership.count({ where: { tenantId: tenant.id } }),
    ]);

    // AuditLog ANTES de borrar: el registro vive en la fila que estamos a
    // punto de cascadear, así que esto es best-effort informativo (queda en
    // los logs del proceso vía logAudit incluso si la fila se borra después).
    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "TENANT_DELETION_REQUESTED",
      payload: {
        tenantName: tenant.name,
        historicalBudgetsCount,
        generatedBudgetsCount,
        membershipsCount,
      },
    });

    await prisma.tenant.delete({ where: { id: tenant.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
