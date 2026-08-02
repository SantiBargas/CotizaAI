import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@prisma/client";

/**
 * AuditLog en operaciones sensibles (upload, indexado, generación, cambios de
 * perfil/billing). Best-effort: nunca rompe la operación principal.
 */
export async function logAudit(params: {
  tenantId: string;
  actorUserId?: string | null;
  action: AuditAction;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        payload: params.payload,
      },
    });
  } catch (err) {
    console.error("No se pudo registrar AuditLog:", err);
  }
}
