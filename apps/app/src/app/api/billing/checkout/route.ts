import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";

/**
 * POST /api/billing/checkout — crea una Checkout Session de Stripe (modo
 * suscripción) vía REST directa, sin SDK. Devuelve { url } para redirigir.
 *
 * El tenant viaja en `client_reference_id` + `metadata.tenantId` (sesión) y en
 * `subscription_data.metadata.tenantId` (suscripción), que es lo que el
 * webhook /api/webhooks/stripe usa para vincular la Subscription local.
 */

const bodySchema = z.object({
  plan: z.enum(["STARTER", "PRO"]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const env = getEnv();

    if (!env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe no está configurado todavía." },
        { status: 503 },
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Plan inválido.");

    const priceId =
      parsed.data.plan === "PRO"
        ? env.STRIPE_PRICE_PRO
        : env.STRIPE_PRICE_STARTER;
    if (!priceId) {
      return NextResponse.json(
        { error: `Falta el price id de Stripe para el plan ${parsed.data.plan}.` },
        { status: 503 },
      );
    }

    const origin = req.nextUrl.origin;
    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: tenant.id,
      "metadata[tenantId]": tenant.id,
      "subscription_data[metadata][tenantId]": tenant.id,
      success_url: `${origin}/configuracion?checkout=success`,
      cancel_url: `${origin}/configuracion?checkout=cancel`,
    });

    // Si el tenant ya tiene customer en Stripe, reutilizarlo (evita duplicados).
    const sub = await prisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      select: { stripeCustomerId: true },
    });
    if (sub?.stripeCustomerId) params.set("customer", sub.stripeCustomerId);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const json = (await res.json()) as {
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || !json.url) {
      console.error("Stripe checkout error:", json.error);
      return NextResponse.json(
        { error: json.error?.message ?? "No se pudo crear el checkout." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: json.url });
  } catch (err) {
    return apiError(err);
  }
}
