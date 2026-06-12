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
