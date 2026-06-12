import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireTenantContext } from "@/lib/api";
import {
  disconnectDrive,
  isDriveConfigured,
} from "@/lib/integrations/google-drive";
import { logAudit } from "@/lib/audit";

/** GET /api/integrations/google — estado de la conexión del tenant. */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const integration = await prisma.tenantIntegration.findUnique({
      where: {
        tenantId_provider: { tenantId: tenant.id, provider: "GOOGLE_DRIVE" },
      },
      select: { accountEmail: true, createdAt: true },
    });
    return NextResponse.json({
      configured: isDriveConfigured(),
      connected: Boolean(integration),
      accountEmail: integration?.accountEmail ?? null,
    });
  } catch (err) {
    return apiError(err);
  }
}

/** DELETE /api/integrations/google — desconecta el Drive del tenant. */
export async function DELETE(): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    await disconnectDrive(tenant.id);
    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "INTEGRATION_DISCONNECTED",
      payload: { provider: "GOOGLE_DRIVE" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
