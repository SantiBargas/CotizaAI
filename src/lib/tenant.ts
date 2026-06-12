import { cache } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import type { User as ClerkUser } from "@clerk/backend";
import { prisma } from "@/lib/prisma";
import type { MembershipRole, Tenant } from "@prisma/client";

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

function fullName(u: ClerkUser): string | null {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : null;
}

function primaryEmail(u: ClerkUser): string | null {
  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
  return (primary ?? u.emailAddresses[0])?.emailAddress ?? null;
}

function mapRole(clerkRole: string): MembershipRole {
  return clerkRole.includes("admin") ? "ADMIN" : "MEMBER";
}

/**
 * Sincroniza Tenant/User/Membership bajo demanda cuando el webhook de Clerk
 * todavía no procesó la organización (típico en desarrollo local, donde Clerk
 * no puede alcanzar `localhost`). El webhook sigue siendo la fuente principal
 * para producción y eventos posteriores (cambios de nombre, bajas, etc.).
 */
async function ensureTenantSynced(
  orgId: string,
  userId: string,
): Promise<Tenant | null> {
  const client = await clerkClient();

  let org;
  try {
    org = await client.organizations.getOrganization({
      organizationId: orgId,
    });
  } catch (err) {
    console.error("No se pudo obtener la organización desde Clerk:", err);
    return null;
  }

  const tenant = await prisma.tenant.upsert({
    where: { clerkOrgId: org.id },
    create: { clerkOrgId: org.id, name: org.name, slug: org.slug },
    update: { name: org.name, slug: org.slug },
  });

  try {
    const clerkUser = await client.users.getUser(userId);
    const email = primaryEmail(clerkUser);
    if (email) {
      const user = await prisma.user.upsert({
        where: { clerkUserId: clerkUser.id },
        create: {
          clerkUserId: clerkUser.id,
          email,
          name: fullName(clerkUser),
          imageUrl: clerkUser.imageUrl ?? null,
        },
        update: {
          email,
          name: fullName(clerkUser),
          imageUrl: clerkUser.imageUrl ?? null,
        },
      });

      const { orgRole } = await auth();
      const role: MembershipRole =
        org.createdBy === userId ? "OWNER" : mapRole(orgRole ?? "org:member");

      await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        create: { tenantId: tenant.id, userId: user.id, role },
        update: { role },
      });
    }
  } catch (err) {
    console.error(
      "No se pudo sincronizar el usuario/membresía con Clerk:",
      err,
    );
  }

  return tenant;
}

/**
 * Devuelve el Tenant activo o null si no hay org seleccionada / sincronizada.
 * Memoizado por request con React cache(): varios llamados en el mismo render
 * (layout, página, helpers) comparten una sola query.
 */
export const getCurrentTenant = cache(
  async (): Promise<Tenant | null> => {
    const { orgId, userId } = await auth();
    if (!orgId) return null;

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
    });
    if (tenant) return tenant;
    if (!userId) return null;

    return ensureTenantSynced(orgId, userId);
  },
);

/** Igual que getCurrentTenant pero lanza si no hay tenant (para API routes). */
export async function requireTenant(): Promise<Tenant> {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new NoTenantError();
  return tenant;
}
