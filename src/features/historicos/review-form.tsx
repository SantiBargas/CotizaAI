"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, Save } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import type { StructuredContent } from "@/types/budget";
import { STATUS_LABELS, type HistoricalBudgetDetail } from "./types";

/**
 * Pantalla de revisión humana: el usuario corrige lo que extrajo la IA antes
 * de aprobar e indexar el histórico para el RAG.
 */
export function ReviewForm({
  budget,
}: {
  budget: HistoricalBudgetDetail;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState(false);

  const [title, setTitle] = useState(budget.title);
  const [client, setClient] = useState(budget.client ?? "");
  const [location, setLocation] = useState(budget.location ?? "");
  const [amount, setAmount] = useState(
    budget.amount !== null ? String(budget.amount) : "",
  );
  const [currency, setCurrency] = useState(budget.currency);
  const [documentDate, setDocumentDate] = useState(
    budget.documentDate ? budget.documentDate.slice(0, 10) : "",
  );
  const emptyStructured: StructuredContent = {
    resumen: null,
    condicionesComerciales: [],
    entregables: [],
    productosEquipos: [],
    tareasDetalladas: [],
  };
  const [structured, setStructured] = useState<StructuredContent>(
    budget.structuredContent ?? emptyStructured,
  );

  function buildPayload(): Record<string, unknown> {
    return {
      title,
      client: client || null,
      location: location || null,
      amount: amount ? Number(amount) : null,
      currency,
      documentDate: documentDate || null,
      structuredContent: structured,
    };
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch(`/api/historicos/${budget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo guardar.");
      }
      toast("success", "Cambios guardados.");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(): Promise<void> {
    setIndexing(true);
    try {
      // Guardar primero los cambios, después indexar.
      const saveRes = await fetch(`/api/historicos/${budget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!saveRes.ok) {
        const json = (await saveRes.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo guardar antes de indexar.");
      }
      const res = await fetch(`/api/historicos/${budget.id}/index`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        chunkCount?: number;
        embeddedCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "No se pudo indexar.");
      toast(
        "success",
        `Indexado: ${json.chunkCount ?? 0} chunks (${json.embeddedCount ?? 0} con embedding).`,
      );
      router.push("/historicos");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIndexing(false);
    }
  }

  function listEditor(
    label: string,
    key: keyof Omit<StructuredContent, "resumen">,
  ): React.ReactElement {
    return (
      <Field
        label={label}
        hint="Un ítem por línea."
      >
        <Textarea
          value={structured[key].join("\n")}
          onChange={(e) =>
            setStructured((prev) => ({
              ...prev,
              [key]: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            }))
          }
          rows={4}
        />
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/historicos"
            className="rounded-[var(--radius-md)] p-2 text-text-muted hover:bg-surface hover:text-text"
            aria-label="Volver"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-text-heading">{title}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={budget.status === "INDEXED" ? "success" : "warning"}
              >
                {STATUS_LABELS[budget.status]}
              </Badge>
              {budget.createdByAI && (
                <span className="text-xs text-text-muted">
                  Extraído con IA — revisá antes de aprobar
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {budget.hasSourceFile && (
            <a
              href={`/api/historicos/${budget.id}/archivo`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">
                <ExternalLink className="size-4" />
                Ver archivo
              </Button>
            </a>
          )}
          <Button
            variant="secondary"
            loading={saving}
            onClick={() => void handleSave()}
          >
            <Save className="size-4" />
            Guardar
          </Button>
          <Button loading={indexing} onClick={() => void handleApprove()}>
            <CheckCircle2 className="size-4" />
            Aprobar e indexar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <CardTitle>Datos del presupuesto</CardTitle>
          <Field label="Título">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cliente">
              <Input
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </Field>
            <Field label="Ubicación">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Monto total">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Moneda" hint="Código ISO (ARS, USD...)">
              <Input
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </Field>
            <Field
              label="Fecha del documento"
              hint="Clave para ajustar por inflación."
            >
              <Input
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Resumen">
            <Textarea
              value={structured.resumen ?? ""}
              onChange={(e) =>
                setStructured((prev) => ({
                  ...prev,
                  resumen: e.target.value || null,
                }))
              }
              rows={3}
            />
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle>Contenido extraído</CardTitle>
          {listEditor("Tareas detalladas", "tareasDetalladas")}
          {listEditor("Productos y equipos", "productosEquipos")}
          {listEditor("Entregables", "entregables")}
          {listEditor("Condiciones comerciales", "condicionesComerciales")}
        </Card>
      </div>

      {budget.rawText && (
        <Card>
          <CardTitle className="mb-3">Texto crudo extraído del PDF</CardTitle>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-surface p-4 text-xs text-text-muted">
            {budget.rawText}
          </pre>
        </Card>
      )}
    </div>
  );
}
