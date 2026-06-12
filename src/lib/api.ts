import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { Tenant, User } from "@prisma/client";
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

/** Mapea errores conocidos a respuestas HTTP coherentes. */
export function apiError(err: unknown): NextResponse {
  if (err instanceof NoTenantError) {
    return NextResponse.json(
      { error: "Seleccioná o creá una organización primero." },
      { status: 403 },
    );
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
