import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

export const runtime = "nodejs";

/**
 * Webhook de Stripe → sincroniza el modelo Subscription del tenant.
 * Configurar en Stripe apuntando a /api/webhooks/stripe con los eventos:
 * checkout.session.completed, customer.subscription.created/updated/deleted.
 *
 * La firma se verifica manualmente (HMAC-SHA256 sobre `t.payload`) con
 * STRIPE_WEBHOOK_SECRET, sin depender del SDK de Stripe.
 *
 * El mapeo plan ↔ price se hace por env (STRIPE_PRICE_STARTER/STRIPE_PRICE_PRO);
 * el tenant se identifica por `client_reference_id` / `metadata.tenantId` en el
 * checkout, o por `stripeCustomerId` ya guardado en eventos posteriores.
 */

interface StripeSubscriptionItem {
  price?: { id?: string };
}

interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: StripeSubscriptionItem[] };
}

interface StripeCheckoutSessionObject {
  client_reference_id?: string | null;
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string>;
}

interface StripeEvent {
  type: string;
  data: { object: StripeSubscriptionObject | StripeCheckoutSessionObject };
}

function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v ?? ""];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function planFromPriceId(
  priceId: string | undefined,
  env: ReturnType<typeof getEnv>,
): SubscriptionPlan {
  if (priceId && env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) {
    return "PRO";
  }
  if (
    priceId &&
    env.STRIPE_PRICE_STARTER &&
    priceId === env.STRIPE_PRICE_STARTER
  ) {
    return "STARTER";
  }
  return "FREE";
}

function statusFromStripe(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "PAST_DUE";
    default:
      return "CANCELED";
  }
}

async function syncSubscription(
  obj: StripeSubscriptionObject,
  env: ReturnType<typeof getEnv>,
): Promise<void> {
  const tenantId = await resolveTenantId(obj.metadata, obj.customer);
  if (!tenantId) return;

  const priceId = obj.items?.data?.[0]?.price?.id;
  const plan = planFromPriceId(priceId, env);
  const status = statusFromStripe(obj.status);
  const currentPeriodEnd = obj.current_period_end
    ? new Date(obj.current_period_end * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      plan,
      status,
      stripeCustomerId: obj.customer,
      stripeSubscriptionId: obj.id,
      currentPeriodEnd,
    },
    update: {
      plan,
      status,
      stripeCustomerId: obj.customer,
      stripeSubscriptionId: obj.id,
      currentPeriodEnd,
    },
  });

  await logAudit({
    tenantId,
    action: "SUBSCRIPTION_CHANGED",
    payload: { plan, status, stripeSubscriptionId: obj.id },
  });
}

async function cancelSubscription(
  obj: StripeSubscriptionObject,
): Promise<void> {
  const tenantId = await resolveTenantId(obj.metadata, obj.customer);
  if (!tenantId) return;

  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { status: "CANCELED" },
  });

  await logAudit({
    tenantId,
    action: "SUBSCRIPTION_CHANGED",
    payload: { status: "CANCELED", stripeSubscriptionId: obj.id },
  });
}

async function linkCheckoutSession(
  obj: StripeCheckoutSessionObject,
): Promise<void> {
  const tenantId = obj.client_reference_id ?? obj.metadata?.tenantId;
  if (!tenantId || !obj.customer) return;

  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      stripeCustomerId: obj.customer,
      stripeSubscriptionId: obj.subscription ?? null,
    },
    update: {
      stripeCustomerId: obj.customer,
      stripeSubscriptionId: obj.subscription ?? null,
    },
  });
}

/** Resuelve el tenant por metadata.tenantId o, si no está, por stripeCustomerId ya guardado. */
async function resolveTenantId(
  metadata: Record<string, string> | undefined,
  customerId: string,
): Promise<string | null> {
  if (metadata?.tenantId) return metadata.tenantId;
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { tenantId: true },
  });
  return sub?.tenantId ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe no está configurado." },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (
    !signature ||
    !verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET)
  ) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await linkCheckoutSession(
          event.data.object as StripeCheckoutSessionObject,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(
          event.data.object as StripeSubscriptionObject,
          env,
        );
        break;
      case "customer.subscription.deleted":
        await cancelSubscription(
          event.data.object as StripeSubscriptionObject,
        );
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("Error procesando webhook de Stripe:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
