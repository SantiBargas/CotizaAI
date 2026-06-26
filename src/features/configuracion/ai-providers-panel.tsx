"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Badge, Button, Select, useToast } from "@/components/ui";
import type { ProviderId } from "@/lib/ai/providers";

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  defaultModel: string;
}

export interface ProviderHealthEntry {
  provider: ProviderId;
  status: "configured" | "not-configured";
}

export interface AiProvidersPanelProps {
  catalog: ProviderCatalogEntry[];
  health: ProviderHealthEntry[];
  initialEnabled: ProviderId[];
  initialDefaultChat: ProviderId | null;
  initialDefaultGeneration: ProviderId | null;
  canEdit: boolean;
}

/** Panel "Proveedores de IA" en /configuracion: habilitar/deshabilitar
 * proveedores por tenant, elegir default de chat/generación, y probar
 * conexión real a demanda (sin gastar cuota automáticamente). */
export function AiProvidersPanel({
  catalog,
  health,
  initialEnabled,
  initialDefaultChat,
  initialDefaultGeneration,
  canEdit,
}: AiProvidersPanelProps): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  // enabled === [] significa "todos habilitados" (default). Para que los
  // checkboxes reflejen ese estado sin ambigüedad, si llega vacío se muestran
  // todos los configurados como tildados.
  const configuredIds = health
    .filter((h) => h.status === "configured")
    .map((h) => h.provider);
  const [enabled, setEnabled] = useState<ProviderId[]>(
    initialEnabled.length > 0 ? initialEnabled : configuredIds,
  );
  const [wasEmpty] = useState(initialEnabled.length === 0);
  const [defaultChat, setDefaultChat] = useState<ProviderId | "">(
    initialDefaultChat ?? "",
  );
  const [defaultGeneration, setDefaultGeneration] = useState<ProviderId | "">(
    initialDefaultGeneration ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState<ProviderId | null>(null);
  const [pingResults, setPingResults] = useState<
    Record<string, { ok: boolean; latencyMs: number; error?: string }>
  >({});

  function toggle(id: ProviderId): void {
    if (!canEdit) return;
    setEnabled((prev) => {
      const isEnabled = prev.includes(id);
      if (isEnabled && prev.length === 1) {
        toast("error", "Tiene que quedar al menos un proveedor habilitado.");
        return prev;
      }
      return isEnabled ? prev.filter((p) => p !== id) : [...prev, id];
    });
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      // Si el usuario nunca tocó nada y arrancó "vacío" (todos habilitados),
      // y sigue teniendo todos los configurados tildados, mandamos [] para
      // preservar la semántica de "todos habilitados" por default.
      const allConfigured =
        configuredIds.length > 0 &&
        configuredIds.every((id) => enabled.includes(id)) &&
        enabled.every((id) => configuredIds.includes(id));
      const payloadEnabled = wasEmpty && allConfigured ? [] : enabled;

      const res = await fetch("/api/configuracion/ia", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabledProviders: payloadEnabled,
          defaultChat: defaultChat || null,
          defaultGeneration: defaultGeneration || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo guardar la configuración.");
      }
      toast("success", "Configuración de IA guardada.");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePing(id: ProviderId): Promise<void> {
    setPinging(id);
    try {
      const res = await fetch("/api/configuracion/ia/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        latencyMs?: number;
        error?: string;
      };
      setPingResults((prev) => ({
        ...prev,
        [id]: {
          ok: Boolean(json.ok),
          latencyMs: json.latencyMs ?? 0,
          error: json.error,
        },
      }));
      if (!res.ok || !json.ok) {
        toast("error", json.error ?? "La conexión falló.");
      } else {
        toast("success", `${id}: conexión OK (${json.latencyMs ?? 0}ms).`);
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setPinging(null);
    }
  }

  const selectablePool = enabled.length > 0 ? enabled : configuredIds;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {catalog.map((p) => {
          const isEnabled = enabled.includes(p.id);
          const healthEntry = health.find((h) => h.provider === p.id);
          const isConfigured = healthEntry?.status === "configured";
          const pingResult = pingResults[p.id];
          return (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={!canEdit || !isConfigured}
                  onChange={() => toggle(p.id)}
                  aria-label={`Habilitar ${p.label}`}
                />
                <div>
                  <p className="text-sm font-medium text-text">{p.label}</p>
                  <p className="text-xs text-text-muted">{p.defaultModel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pingResult && (
                  <Badge variant={pingResult.ok ? "success" : "error"}>
                    {pingResult.ok ? `${pingResult.latencyMs}ms` : "Error"}
                  </Badge>
                )}
                <Badge variant={isConfigured ? "success" : "neutral"}>
                  {isConfigured ? "Configurado" : "Sin API key"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={pinging === p.id}
                  disabled={!isConfigured}
                  onClick={() => void handlePing(p.id)}
                  title="Hace una llamada real mínima para confirmar conectividad."
                >
                  <Wand2 className="size-3.5" />
                  Probar conexión
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">
            Default para chat
          </label>
          <Select
            value={defaultChat}
            disabled={!canEdit}
            onChange={(e) => setDefaultChat(e.target.value as ProviderId | "")}
          >
            <option value="">Automático (primero disponible)</option>
            {selectablePool.map((id) => (
              <option key={id} value={id}>
                {catalog.find((c) => c.id === id)?.label ?? id}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">
            Default para generación
          </label>
          <Select
            value={defaultGeneration}
            disabled={!canEdit}
            onChange={(e) =>
              setDefaultGeneration(e.target.value as ProviderId | "")
            }
          >
            <option value="">Automático (primero disponible)</option>
            {selectablePool.map((id) => (
              <option key={id} value={id}>
                {catalog.find((c) => c.id === id)?.label ?? id}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button loading={saving} onClick={() => void handleSave()}>
            Guardar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          Solo el propietario o un administrador puede modificar esta
          configuración.
        </p>
      )}
    </div>
  );
}
