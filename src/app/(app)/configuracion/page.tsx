import { auth } from "@clerk/nextjs/server";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getTenantPlan, getTenantUsageSummary } from "@/lib/billing/limits";
import { PLANS } from "@/lib/billing/plans";
import {
  checkAllProvidersHealth,
  isProviderId,
  PROVIDER_CATALOG,
  type ProviderId,
} from "@/lib/ai/providers";
import { isEmbeddingConfigured } from "@/lib/ai/embeddings";
import { isStorageConfigured } from "@/lib/storage";
import { isDriveConfigured } from "@/lib/integrations/google-drive";
import { Badge, Card, CardTitle } from "@/components/ui";
import { InflacionSync } from "@/features/configuracion/inflacion-sync";
import { UpgradePlanButton } from "@/features/configuracion/upgrade-plan";
import { AiProvidersPanel } from "@/features/configuracion/ai-providers-panel";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para ver la configuración.
      </p>
    );
  }

  const { userId: clerkUserId } = await auth();

  const [
    plan,
    usageSummary,
    members,
    latestIndex,
    driveIntegration,
    aiConfig,
    localUser,
  ] = await Promise.all([
    getTenantPlan(tenant.id),
    getTenantUsageSummary(tenant.id),
    prisma.membership.findMany({
      where: { tenantId: tenant.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inflationIndex.findFirst({
      where: { country: tenant.country, currency: tenant.defaultCurrency },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.tenantIntegration.findUnique({
      where: {
        tenantId_provider: { tenantId: tenant.id, provider: "GOOGLE_DRIVE" },
      },
      select: { accountEmail: true },
    }),
    prisma.tenantAiConfig.findUnique({ where: { tenantId: tenant.id } }),
    clerkUserId
      ? prisma.user.findUnique({ where: { clerkUserId } })
      : Promise.resolve(null),
  ]);

  const currentMembership = localUser
    ? members.find((m) => m.userId === localUser.id)
    : undefined;
  const canEditAiConfig =
    currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  const health = checkAllProvidersHealth();
  const enabledProviders = (aiConfig?.enabledProviders ?? []).filter(
    isProviderId,
  );
  const defaultChat: ProviderId | null =
    aiConfig?.defaultChat && isProviderId(aiConfig.defaultChat)
      ? aiConfig.defaultChat
      : null;
  const defaultGeneration: ProviderId | null =
    aiConfig?.defaultGeneration && isProviderId(aiConfig.defaultGeneration)
      ? aiConfig.defaultGeneration
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-heading">Configuración</h1>
        <p className="mt-1 text-sm text-text-muted">
          Plan, uso, miembros y estado de los servicios de {tenant.name}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle>Plan y uso</CardTitle>
            <Badge variant="accent">{plan.label}</Badge>
          </div>
          <p className="text-sm text-text-muted">{plan.description}</p>
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Tu consumo
            </p>
            <UsageBar
              label="Generaciones este mes"
              used={usageSummary.generationsUsed}
              limit={usageSummary.generationsLimit}
            />
            <UsageBar
              label="Históricos cargados"
              used={usageSummary.historicalsUsed}
              limit={usageSummary.historicalsLimit}
            />
            <UsageBar
              label="Miembros de la organización"
              used={usageSummary.membersUsed}
              limit={usageSummary.membersLimit}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 border-t border-border pt-4">
            {Object.values(PLANS).map((p) => (
              <div
                key={p.id}
                className={`flex flex-col gap-1 rounded-[var(--radius-md)] border p-3 text-center ${
                  p.id === plan.id
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <p className="text-sm font-semibold text-text-heading">
                  {p.label}
                </p>
                <p className="text-xs text-text-muted">
                  {p.priceUsdMonthly === 0
                    ? "Gratis"
                    : `USD ${p.priceUsdMonthly}/mes`}
                </p>
                <p className="text-xs text-text-muted">
                  {p.limits.generationsPerMonth} gen/mes
                </p>
                {p.id !== "FREE" && (
                  <div className="mt-2">
                    <UpgradePlanButton
                      plan={p.id}
                      current={p.id === plan.id}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            El pago se procesa con Stripe. Mercado Pago para AR está en
            evaluación.
          </p>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle>Miembros</CardTitle>
          {members.length === 0 ? (
            <p className="text-sm text-text-muted">
              Todavía no se sincronizaron miembros (revisá el webhook de Clerk).
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-text">
                      {m.user.name ?? m.user.email}
                    </p>
                    <p className="text-xs text-text-muted">{m.user.email}</p>
                  </div>
                  <Badge
                    variant={m.role === "OWNER" ? "accent" : "neutral"}
                  >
                    {m.role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted">
            Las invitaciones se gestionan desde el selector de organización
            (Clerk) en la barra superior.
          </p>
        </Card>

        <Card className="flex flex-col gap-4 lg:col-span-2">
          <CardTitle>Proveedores de IA</CardTitle>
          <AiProvidersPanel
            catalog={Object.values(PROVIDER_CATALOG).map((p) => ({
              id: p.id,
              label: p.label,
              defaultModel: p.defaultModel,
            }))}
            health={health}
            initialEnabled={enabledProviders}
            initialDefaultChat={defaultChat}
            initialDefaultGeneration={defaultGeneration}
            canEdit={canEditAiConfig}
          />
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Badge variant={isEmbeddingConfigured() ? "success" : "warning"}>
              Embeddings (RAG vectorial):{" "}
              {isEmbeddingConfigured() ? "OK" : "sin configurar"}
            </Badge>
            <Badge variant={isStorageConfigured() ? "success" : "warning"}>
              Storage de PDFs: {isStorageConfigured() ? "OK" : "sin configurar"}
            </Badge>
            <Badge
              variant={
                !isDriveConfigured()
                  ? "neutral"
                  : driveIntegration
                    ? "success"
                    : "warning"
              }
            >
              Google Drive:{" "}
              {!isDriveConfigured()
                ? "sin configurar"
                : driveIntegration
                  ? (driveIntegration.accountEmail ?? "conectado")
                  : "configurado, sin conectar"}
            </Badge>
          </div>
          <p className="text-xs text-text-muted">
            Las API keys se configuran por variables de entorno del servidor.
          </p>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle>Inflación ({tenant.country}/{tenant.defaultCurrency})</CardTitle>
            <InflacionSync />
          </div>
          {latestIndex ? (
            <p className="text-sm text-text">
              Último índice cargado:{" "}
              <span className="font-medium">
                {latestIndex.month}/{latestIndex.year}
              </span>{" "}
              ({(latestIndex.monthlyRate * 100).toFixed(1)}% mensual
              {latestIndex.source ? ` · fuente ${latestIndex.source}` : ""})
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              Sin índices cargados. Sincronizá el IPC de INDEC para que los
              montos históricos se actualicen a valor de hoy.
            </p>
          )}
          <p className="text-xs text-text-muted">
            Los índices alimentan el ajuste automático de los montos históricos
            en la generación.
          </p>
        </Card>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}): React.ReactElement {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-text">{label}</span>
        <span className="tabular-nums text-text-muted">
          {used}/{limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-[var(--radius-full)] bg-surface">
        <div
          className={`h-full rounded-[var(--radius-full)] ${
            pct >= 90 ? "bg-error" : pct >= 70 ? "bg-warning" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
