import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireTenantRole } from "@/lib/api";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/configuracion/exportar — exporta todo el histórico de datos del
 * tenant (I.3: política de exportación antes de cancelar/borrar) como un
 * único JSON descargable. Solo OWNER/ADMIN.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantRole(["OWNER", "ADMIN"]);

    const [historicalBudgets, generatedBudgets, profile] = await Promise.all([
      prisma.historicalBudget.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.generatedBudget.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.companyProfile.findUnique({ where: { tenantId: tenant.id } }),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        country: tenant.country,
        defaultCurrency: tenant.defaultCurrency,
      },
      companyProfile: profile,
      historicalBudgets,
      generatedBudgets,
    };

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "DATA_EXPORTED",
      payload: {
        historicalBudgetsCount: historicalBudgets.length,
        generatedBudgetsCount: generatedBudgets.length,
      },
    });

    const fileName = `cotizaai-export-${tenant.slug}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
