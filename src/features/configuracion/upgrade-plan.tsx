"use client";

import { useState } from "react";
import { Button, useToast } from "@/components/ui";

type PaidPlan = "STARTER" | "PRO";

/**
 * Botón de upgrade: crea la Checkout Session de Stripe y redirige.
 * Si Stripe no está configurado (503), lo informa sin romper.
 */
export function UpgradePlanButton({
  plan,
  current,
}: {
  plan: PaidPlan;
  current: boolean;
}): React.ReactElement {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "No se pudo iniciar el checkout.");
      }
      window.location.href = json.url;
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
      setLoading(false);
    }
  }

  if (current) {
    return (
      <Button variant="secondary" size="sm" disabled className="w-full">
        Plan actual
      </Button>
    );
  }

  return (
    <Button
      variant={plan === "PRO" ? "accent" : "primary"}
      size="sm"
      loading={loading}
      onClick={() => void handleUpgrade()}
      className="w-full"
    >
      Mejorar a {plan === "PRO" ? "Pro" : "Starter"}
    </Button>
  );
}
