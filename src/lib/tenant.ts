import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Tenant } from "@prisma/client";

/**
 * Resolución de tenant a partir de la sesión Clerk.
 *
 * REGLA DE ORO: el `tenantId` SIEMPRE se deriva de la sesión (orgId de Clerk),
 * NUNCA del body del cliente. Toda query de negocio debe filtrar por este id.
 */

export class NoTenantError extends Error {
  constructor() {
    super("No hay organización activa en la sesión.");
    this.name = "NoTenantError";
  }
}

/** Devuelve el Tenant activo o null si no hay org seleccionada / sincronizada. */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const { orgId } = await auth();
  if (!orgId) return null;
  return prisma.tenant.findUnique({ where: { clerkOrgId: orgId } });
}

/** Igual que getCurrentTenant pero lanza si no hay tenant (para API routes). */
export async function requireTenant(): Promise<Tenant> {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new NoTenantError();
  return tenant;
}
