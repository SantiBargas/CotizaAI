import { getTenantUsageSummary } from "@/lib/billing/limits";
import { PLANS } from "@/lib/billing/plans";
import { UsageLimitBanner } from "@/features/billing/usage-limit-banner";

const WARNING_THRESHOLD = 0.8;

function usageWarningMessages(
  summary: Awaited<ReturnType<typeof getTenantUsageSummary>>,
): string[] {
  const planLabel = PLANS[summary.plan].label;
  const metrics: Array<{ label: string; used: number; limit: number }> = [
    {
      label: "generaciones mensuales",
      used: summary.generationsUsed,
      limit: summary.generationsLimit,
    },
    {
      label: "históricos cargados",
      used: summary.historicalsUsed,
      limit: summary.historicalsLimit,
    },
    {
      label: "miembros de la organización",
      used: summary.membersUsed,
      limit: summary.membersLimit,
    },
  ];

  return metrics
    .filter((m) => m.limit > 0 && m.used / m.limit >= WARNING_THRESHOLD)
    .map((m) => {
      const pct = Math.round((m.used / m.limit) * 100);
      return `Estás usando el ${pct}% de tus ${m.label} del plan ${planLabel}. Considerá upgradear.`;
    });
}

/**
 * Envuelto en Suspense desde el layout para que la query de uso (plan +
 * 3 counts) no bloquee el render del resto de la página — es un aviso no
 * crítico, puede aparecer un instante después del contenido principal.
 */
export async function UsageLimitBannerAsync({
  tenantId,
}: {
  tenantId: string;
}): Promise<React.ReactElement> {
  const summary = await getTenantUsageSummary(tenantId);
  return <UsageLimitBanner messages={usageWarningMessages(summary)} />;
}
