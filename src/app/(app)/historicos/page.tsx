import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isDriveConfigured } from "@/lib/integrations/google-drive";
import { HistoricosList } from "@/features/historicos/historicos-list";
import type { HistoricalBudgetListItem } from "@/features/historicos/types";

export const dynamic = "force-dynamic";

const DRIVE_MESSAGES: Record<string, { text: string; error: boolean }> = {
  connected: { text: "Google Drive conectado correctamente.", error: false },
  denied: { text: "Cancelaste la conexión con Google Drive.", error: true },
  error: { text: "No se pudo conectar Google Drive. Probá de nuevo.", error: true },
  "state-error": {
    text: "La sesión de conexión expiró. Probá conectar de nuevo.",
    error: true,
  },
};

export default async function HistoricosPage({
  searchParams,
}: {
  searchParams: Promise<{ drive?: string }>;
}): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para cargar históricos.
      </p>
    );
  }

  const [rows, integration, params] = await Promise.all([
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
    searchParams,
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

  const driveMessage = params.drive ? DRIVE_MESSAGES[params.drive] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {driveMessage && (
        <p
          className={`rounded-[var(--radius-md)] border px-4 py-3 text-sm ${
            driveMessage.error
              ? "border-error/40 bg-error/5 text-error"
              : "border-success/40 bg-success/5 text-success"
          }`}
        >
          {driveMessage.text}
        </p>
      )}
      <HistoricosList
        budgets={budgets}
        drive={{
          configured: isDriveConfigured(),
          connected: Boolean(integration),
          accountEmail: integration?.accountEmail ?? null,
        }}
      />
    </div>
  );
}
