import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantRole } from "@/lib/api";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/configuracion/cuenta — borra la organización completa (I.3:
 * política de borrado de datos). Solo OWNER. Requiere `{ confirmacion: string }`
 * en el body, que tiene que ser EXACTAMENTE el nombre del tenant (`tenant.name`).
 *
 * Borra primero la organización en Clerk y recién después el Tenant local:
 * si lo hiciéramos al revés, cualquier miembro podría volver a seleccionar
 * la organización (que seguiría existiendo en Clerk) y el sync automático
 * de src/lib/tenant.ts la resucitaría sola. En este orden, si el borrado en
 * Clerk falla no tocamos nada local; si Clerk borra bien pero el borrado
 * local falla después, queda una fila huérfana sin datos sensibles (se
 * puede reintentar el DELETE, `clerkOrgId` ya no existe en Clerk).
 *
 * Nota: si la organización se borra por otro camino (el selector nativo de
 * Clerk, o el dashboard de Clerk) en vez de este endpoint, la limpieza local
 * corre por cuenta del webhook `organization.deleted` en
 * api/webhooks/clerk/route.ts — que en desarrollo local no puede dispararse
 * porque Clerk no puede alcanzar `localhost`. En producción sí llega.
 *
 * Las cascadas (`onDelete: Cascade`) ya están configuradas en
 * prisma/schema.prisma para Membership, CompanyProfile, TenantAiConfig,
 * HistoricalBudget, BudgetChunk, IncompatibleFile, GeneratedBudget,
 * BudgetTemplate, UsageRecord, Subscription, TenantIntegration y AuditLog —
 * borrar el Tenant se lleva todo lo demás en una sola operación.
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

    const client = await clerkClient();
    try {
      await client.organizations.deleteOrganization(tenant.clerkOrgId);
    } catch (err) {
      console.error("No se pudo borrar la organización en Clerk:", err);
      return NextResponse.json(
        {
          error:
            "No se pudo borrar la organización en Clerk. Probá de nuevo en unos minutos.",
        },
        { status: 502 },
      );
    }

    await prisma.tenant.delete({ where: { id: tenant.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
