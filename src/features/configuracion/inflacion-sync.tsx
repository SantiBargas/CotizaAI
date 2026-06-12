"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button, useToast } from "@/components/ui";

/** Botón de sincronización del IPC INDEC (AR/ARS). */
export function InflacionSync(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  async function handleSync(): Promise<void> {
    setSyncing(true);
    try {
      const res = await fetch("/api/inflacion/sync", { method: "POST" });
      const json = (await res.json()) as {
        upserted?: number;
        latest?: { year: number; month: number } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "No se pudo sincronizar.");
      toast(
        "success",
        `IPC sincronizado: ${json.upserted ?? 0} índices (último: ${
          json.latest ? `${json.latest.month}/${json.latest.year}` : "—"
        }).`,
      );
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={syncing}
      onClick={() => void handleSync()}
    >
      <RefreshCw className="size-4" />
      Sincronizar IPC (INDEC)
    </Button>
  );
}
