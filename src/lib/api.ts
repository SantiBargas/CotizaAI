import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { MembershipRole, Tenant, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NoTenantError, requireTenant } from "@/lib/tenant";

/**
 * Contexto común para API routes autenticadas: tenant (derivado de la sesión
 * Clerk, regla de oro) + usuario local (espejo del webhook).
 */

export interface TenantContext {
  tenant: Tenant;
  user: User | null;
}

export async function requireTenantContext(): Promise<TenantContext> {
  const tenant = await requireTenant();
  const { userId: clerkUserId } = await auth();
  const user = clerkUserId
    ? await prisma.user.findUnique({ where: { clerkUserId } })
    : null;
  return { tenant, user };
}

export class ForbiddenError extends Error {
  constructor(message = "No tenés permisos para esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Igual que `requireTenantContext`, pero exige que el usuario tenga uno de
 * los roles indicados (`Membership.role`) dentro del tenant. Usar en rutas
 * que modifican configuración sensible (solo OWNER/ADMIN).
 */
export async function requireTenantRole(
  roles: MembershipRole[],
): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  if (!ctx.user) throw new ForbiddenError();
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: ctx.user.id } },
    select: { role: true },
  });
  if (!membership || !roles.includes(membership.role)) {
    throw new ForbiddenError();
  }
  return ctx;
}

/** Mapea errores conocidos a respuestas HTTP coherentes. */
export function apiError(err: unknown): NextResponse {
  if (err instanceof NoTenantError) {
    return NextResponse.json(
      { error: "Seleccioná o creá una organización primero." },
      { status: 403 },
    );
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  const message =
    err instanceof Error ? err.message : "Error interno inesperado.";
  console.error("API error:", err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string = "No encontrado."): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}
