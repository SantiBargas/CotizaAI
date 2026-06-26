"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown } from "lucide-react";
import { Badge, Button, Card, CardTitle, EmptyState, Spinner, useToast } from "@/components/ui";

interface SuspiciousHistoricalItem {
  id: string;
  title: string;
  amount: number | null;
  createdAt: string;
}

interface SuspiciousGroup {
  reason: string;
  label: string;
  count: number;
  items: SuspiciousHistoricalItem[];
}

/**
 * Auditoría de calidad de históricos (docs/tareas.md E.1-E.2): detecta
 * duplicados, datos incompletos, extracción pobre y pendientes hace mucho,
 * antes de que contaminen el RAG. El admin puede marcarlos como revisados.
 */
export function HistoricosAuditPanel(): React.ReactElement {
  const { toast } = useToast();
  const [groups, setGroups] = useState<SuspiciousGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function load(): Promise<void> {
    try {
      const res = await fetch("/api/historicos/audit");
      const json = (await res.json()) as { groups?: SuspiciousGroup[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la auditoría.");
      setGroups(json.groups ?? []);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/historicos/audit")
      .then((res) => res.json())
      .then((json: { groups?: SuspiciousGroup[] }) => setGroups(json.groups ?? []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markReviewed(): Promise<void> {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/historicos/audit/revisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], revisado: true }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo marcar como revisado.");
      }
      toast("success", "Marcados como revisados.");
      setSelected(new Set());
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const totalSuspicious = groups?.reduce((acc, g) => acc + g.count, 0) ?? 0;

  return (
    <Card className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          {totalSuspicious > 0 ? (
            <ShieldAlert className="size-4 text-warning" />
          ) : (
            <ShieldCheck className="size-4 text-success" />
          )}
          <CardTitle>Auditoría de calidad</CardTitle>
          {!loading && totalSuspicious > 0 && (
            <Badge variant="warning">{totalSuspicious}</Badge>
          )}
        </div>
        <ChevronDown
          className={`size-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Spinner className="size-4" />
              Analizando históricos...
            </div>
          ) : groups && groups.length > 0 ? (
            <>
              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <div
                    key={g.reason}
                    className="rounded-[var(--radius-md)] border border-border p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="warning">{g.label}</Badge>
                      <span className="text-xs text-text-muted">{g.count} caso(s)</span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {g.items.map((item) => (
                        <li key={`${g.reason}-${item.id}`} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                            className="size-3.5"
                          />
                          <span className="truncate text-text">{item.title}</span>
                          {item.amount !== null && (
                            <span className="text-xs text-text-muted">
                              ${item.amount.toLocaleString("es-AR")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={saving}
                  disabled={selected.size === 0}
                  onClick={() => void markReviewed()}
                >
                  Marcar como revisado ({selected.size})
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ShieldCheck className="size-6" />}
              title="Tu histórico está limpio"
              description="No se detectaron duplicados, datos incompletos ni casos pendientes hace mucho tiempo."
            />
          )}
        </div>
      )}
    </Card>
  );
}
