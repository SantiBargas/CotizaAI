import type { SubscriptionPlan } from "@prisma/client";

/**
 * Planes y límites de uso (Fase 4). Los precios son de presentación; el cobro
 * real se integra con Stripe (y se evalúa Mercado Pago para AR) cuando haya
 * claves. Los límites se aplican desde ya en los endpoints.
 */

export interface PlanLimits {
  /** Generaciones de presupuestos por mes calendario. */
  generationsPerMonth: number;
  /** Históricos totales cargados (activos, no archivados). */
  maxHistoricals: number;
  /** Miembros por organización. */
  maxMembers: number;
}

export interface PlanInfo {
  id: SubscriptionPlan;
  label: string;
  priceUsdMonthly: number;
  description: string;
  limits: PlanLimits;
}

export const PLANS: Record<SubscriptionPlan, PlanInfo> = {
  FREE: {
    id: "FREE",
    label: "Free",
    priceUsdMonthly: 0,
    description: "Para probar CotizaAI con tu propio histórico.",
    limits: { generationsPerMonth: 10, maxHistoricals: 20, maxMembers: 2 },
  },
  STARTER: {
    id: "STARTER",
    label: "Starter",
    priceUsdMonthly: 19,
    description: "Para equipos chicos que cotizan todas las semanas.",
    limits: { generationsPerMonth: 100, maxHistoricals: 200, maxMembers: 5 },
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    priceUsdMonthly: 49,
    description: "Para empresas que viven de cotizar.",
    limits: { generationsPerMonth: 1000, maxHistoricals: 2000, maxMembers: 20 },
  },
};
