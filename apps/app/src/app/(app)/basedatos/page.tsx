import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isDriveConfigured } from "@/lib/integrations/google-drive";
import { BaseDatosApp } from "@/features/basedatos/base-datos-app";
import type { HistoricalBudgetListItem } from "@/features/historicos/types";

export const dynamic = "force-dynamic";

/**
 * Único punto de entrada de /basedatos: gatea por rol UNA sola vez y trae
 * todos los datos en paralelo. El shell client-side (BaseDatosApp) maneja
 * la navegación entre módulos como estado de React, no como rutas — cambiar
 * de módulo no vuelve a pasar por acá. Ver plan de refactor (mismo patrón
 * que BaseDatosScreen de ITZA).
 */
export default async function BaseDatosPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  const { userId: clerkUserId } = await auth();
  const membership =
    tenant && clerkUserId
      ? await prisma.membership.findFirst({
          where: { tenantId: tenant.id, user: { clerkUserId } },
          select: { role: true },
        })
      : null;
  const isAdmin =
    membership?.role === "OWNER" || membership?.role === "ADMIN";

  if (!isAdmin) redirect("/inicio");
  if (!tenant) redirect("/inicio");

  const [rows, integration, indices] = await Promise.all([
    prisma.historicalBudget.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        client: true,
        location: true,
        amount: true,
        currency: true,
        documentDate: true,
        sourceFileName: true,
        status: true,
        createdByAI: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    }),
    prisma.tenantIntegration.findUnique({
      where: {
        tenantId_provider: { tenantId: tenant.id, provider: "GOOGLE_DRIVE" },
      },
      select: { accountEmail: true },
    }),
    prisma.inflationIndex.findMany({
      where: { country: tenant.country, currency: tenant.defaultCurrency },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 60,
    }),
  ]);

  const budgets: HistoricalBudgetListItem[] = rows.map((b) => ({
    id: b.id,
    title: b.title,
    client: b.client,
    location: b.location,
    amount: b.amount === null ? null : Number(b.amount),
    currency: b.currency,
    documentDate: b.documentDate?.toISOString() ?? null,
    sourceFileName: b.sourceFileName,
    status: b.status,
    createdByAI: b.createdByAI,
    createdAt: b.createdAt.toISOString(),
    chunkCount: b._count.chunks,
  }));

  return (
    <Suspense fallback={null}>
      <BaseDatosApp
        budgets={budgets}
        driveConnected={isDriveConfigured() && Boolean(integration)}
        indices={indices}
        country={tenant.country}
        currency={tenant.defaultCurrency}
      />
    </Suspense>
  );
}
