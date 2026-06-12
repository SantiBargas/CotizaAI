import Link from "next/link";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui";
import { BUDGET_STATUS_LABELS } from "@/features/presupuestos/types";
import {
  PrimerosPasos,
  type OnboardingStep,
} from "@/features/onboarding/primeros-pasos";

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para ver el panel.
      </p>
    );
  }

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );

  const [
    historicalsTotal,
    historicalsIndexed,
    budgetsTotal,
    budgetsThisMonth,
    tokensThisMonth,
    recentBudgets,
    profile,
  ] = await Promise.all([
    prisma.historicalBudget.count({
      where: { tenantId: tenant.id, status: { not: "ARCHIVED" } },
    }),
    prisma.historicalBudget.count({
      where: { tenantId: tenant.id, status: "INDEXED" },
    }),
    prisma.generatedBudget.count({ where: { tenantId: tenant.id } }),
    prisma.generatedBudget.count({
      where: { tenantId: tenant.id, createdAt: { gte: monthStart } },
    }),
    prisma.usageRecord.aggregate({
      where: { tenantId: tenant.id, createdAt: { gte: monthStart } },
      _sum: { totalTokens: true },
    }),
    prisma.generatedBudget.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
      },
    }),
    prisma.companyProfile.findUnique({
      where: { tenantId: tenant.id },
      select: { industryPrompt: true, industry: true },
    }),
  ]);

  const onboardingSteps: OnboardingStep[] = [
    {
      label: "Completá el perfil de tu empresa",
      description:
        "El rubro y el prompt del rubro son lo que más mejora la calidad de la IA.",
      href: "/perfil",
      done: Boolean(profile?.industryPrompt || profile?.industry),
    },
    {
      label: "Cargá tu primer presupuesto histórico",
      description: "Subí un PDF de un presupuesto que ya hayas enviado.",
      href: "/historicos",
      done: historicalsTotal > 0,
    },
    {
      label: "Revisalo e indexalo",
      description:
        "Aprobá la extracción para que la IA pueda usarlo como referencia.",
      href: "/historicos",
      done: historicalsIndexed > 0,
    },
    {
      label: "Generá tu primer presupuesto con IA",
      description: "Pedilo en lenguaje natural y editá el resultado.",
      href: "/generar",
      done: budgetsTotal > 0,
    },
  ];
  const onboardingDone = onboardingSteps.every((s) => s.done);

  // Acentos de marca por métrica (paleta Miami Dolphins).
  const cards = [
    {
      titulo: "Históricos",
      valor: historicalsTotal,
      nota: `${historicalsIndexed} indexados para RAG`,
      accent: "border-t-brand-aqua",
    },
    {
      titulo: "Presupuestos",
      valor: budgetsTotal,
      nota: `${budgetsThisMonth} generados este mes`,
      accent: "border-t-brand-blue",
    },
    {
      titulo: "Uso de IA este mes",
      valor: tokensThisMonth._sum.totalTokens ?? 0,
      nota: "tokens consumidos",
      accent: "border-t-brand-orange",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-heading">
          Panel
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Empresa activa: {tenant.name}
        </p>
      </div>

      {!onboardingDone && <PrimerosPasos steps={onboardingSteps} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.titulo}
            className={`rounded-[var(--radius-lg)] border border-border border-t-4 ${c.accent} bg-surface-elevated p-6 shadow-[var(--shadow-sm)]`}
          >
            <p className="text-sm text-text-muted">{c.titulo}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-text-heading">
              {c.valor.toLocaleString("es-AR")}
            </p>
            <p className="mt-1 text-xs text-text-muted">{c.nota}</p>
          </div>
        ))}
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <CardTitle>Últimos presupuestos generados</CardTitle>
          <Link
            href="/presupuestos"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver todos
          </Link>
        </div>
        {recentBudgets.length === 0 ? (
          <EmptyState
            title="Todavía no generaste presupuestos"
            description="Cargá tus históricos y generá tu primer presupuesto con IA."
            action={
              <Link
                href="/generar"
                className="text-sm font-medium text-primary hover:underline"
              >
                Generar presupuesto
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {recentBudgets.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <Link
                    href={`/presupuestos/${b.id}`}
                    className="text-sm font-medium text-text hover:text-primary hover:underline"
                  >
                    {b.title}
                  </Link>
                  <p className="text-xs text-text-muted">
                    {formatDateTime(b.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {b.totalAmount !== null && (
                    <span className="text-sm tabular-nums text-text-muted">
                      {b.currency} {b.totalAmount.toString()}
                    </span>
                  )}
                  <Badge
                    variant={b.status === "FINAL" ? "success" : "neutral"}
                  >
                    {BUDGET_STATUS_LABELS[b.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

    </div>
  );
}
