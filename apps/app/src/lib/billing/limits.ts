import type { SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLANS, type PlanInfo } from "@/lib/billing/plans";

/** Chequeos de límites por plan, aplicados en los endpoints de negocio. */

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

/** Plan efectivo del tenant (sin registro de Subscription → FREE). */
export async function getTenantPlan(tenantId: string): Promise<PlanInfo> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { plan: true, status: true },
  });
  const plan: SubscriptionPlan =
    sub && (sub.status === "ACTIVE" || sub.status === "TRIALING")
      ? sub.plan
      : "FREE";
  return PLANS[plan];
}

/** ¿Puede generar otro presupuesto este mes calendario? */
export async function checkGenerationLimit(
  tenantId: string,
): Promise<LimitCheck> {
  const plan = await getTenantPlan(tenantId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const used = await prisma.generatedBudget.count({
    where: { tenantId, createdAt: { gte: monthStart } },
  });
  return {
    allowed: used < plan.limits.generationsPerMonth,
    used,
    limit: plan.limits.generationsPerMonth,
  };
}

/** ¿Puede cargar otro histórico? (cuenta los no archivados) */
export async function checkHistoricalLimit(
  tenantId: string,
): Promise<LimitCheck> {
  const plan = await getTenantPlan(tenantId);
  const used = await prisma.historicalBudget.count({
    where: { tenantId, status: { not: "ARCHIVED" } },
  });
  return {
    allowed: used < plan.limits.maxHistoricals,
    used,
    limit: plan.limits.maxHistoricals,
  };
}

export interface TenantUsageSummary {
  plan: SubscriptionPlan;
  generationsUsed: number;
  generationsLimit: number;
  historicalsUsed: number;
  historicalsLimit: number;
  membersUsed: number;
  membersLimit: number;
}

/**
 * Resumen de consumo del tenant contra los límites de su plan: generaciones
 * de IA del mes calendario actual, históricos activos (no archivados) y
 * miembros de la organización. Usado tanto en la UI de consumo (`/configuracion`)
 * como en el banner de alerta de proximidad a límite.
 */
export async function getTenantUsageSummary(
  tenantId: string,
): Promise<TenantUsageSummary> {
  const plan = await getTenantPlan(tenantId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [generationsUsed, historicalsUsed, membersUsed] = await Promise.all([
    prisma.usageRecord.count({
      where: {
        tenantId,
        operation: "GENERATION",
        createdAt: { gte: monthStart },
      },
    }),
    prisma.historicalBudget.count({
      where: { tenantId, status: { not: "ARCHIVED" } },
    }),
    prisma.membership.count({ where: { tenantId } }),
  ]);

  return {
    plan: plan.id,
    generationsUsed,
    generationsLimit: plan.limits.generationsPerMonth,
    historicalsUsed,
    historicalsLimit: plan.limits.maxHistoricals,
    membersUsed,
    membersLimit: plan.limits.maxMembers,
  };
}
