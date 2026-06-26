"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, FileText, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Table,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { DriveImport } from "./drive-import";
import {
  STATUS_LABELS,
  type HistoricalBudgetListItem,
} from "./types";

export interface DriveStatus {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
}

const statusVariant: Record<
  HistoricalBudgetListItem["status"],
  "warning" | "success" | "neutral"
> = {
  PENDING_REVIEW: "warning",
  INDEXED: "success",
  ARCHIVED: "neutral",
};

export function HistoricosList({
  budgets,
  drive,
}: {
  budgets: HistoricalBudgetListItem[];
  drive: DriveStatus;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(): Promise<void> {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast("warning", "Elegí un archivo primero.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/historicos/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        budget?: { id: string };
        error?: string;
      };
      if (!res.ok || !json.budget) {
        throw new Error(json.error ?? "Error subiendo el archivo.");
      }
      toast("success", "Archivo procesado. Revisá los datos extraídos.");
      setUploadOpen(false);
      router.push(`/historicos/${json.budget.id}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm("¿Eliminar este histórico y sus datos indexados?")) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/historicos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo eliminar.");
      }
      toast("success", "Histórico eliminado.");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-heading">Históricos</h1>
          <p className="mt-1 text-sm text-text-muted">
            Tus presupuestos pasados. La IA aprende de ellos para generar los
            nuevos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {drive.configured && (
            <DriveImport
              connected={drive.connected}
              accountEmail={drive.accountEmail}
            />
          )}
          <Button onClick={() => setUploadOpen(true)}>
            <FileUp className="size-4" />
            Subir histórico
          </Button>
        </div>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-10" />}
          title="Todavía no cargaste históricos"
          description="Subí tus presupuestos en PDF, Word o Excel: la IA extrae los datos, vos los revisás y quedan listos para alimentar al generador."
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <FileUp className="size-4" />
              Subir mi primer histórico
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Título</TH>
              <TH>Cliente</TH>
              <TH>Monto</TH>
              <TH>Fecha doc.</TH>
              <TH>Estado</TH>
              <TH>Chunks</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {budgets.map((b) => (
              <TRow key={b.id}>
                <TD>
                  <Link
                    href={`/historicos/${b.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {b.title}
                  </Link>
                  {b.createdByAI && (
                    <span className="ml-2 text-xs text-text-muted">· IA</span>
                  )}
                </TD>
                <TD>{b.client ?? "—"}</TD>
                <TD className="tabular-nums">
                  {b.amount !== null
                    ? formatMoney(b.amount, b.currency)
                    : "—"}
                </TD>
                <TD>{b.documentDate ? formatDate(b.documentDate) : "—"}</TD>
                <TD>
                  <Badge variant={statusVariant[b.status]}>
                    {STATUS_LABELS[b.status]}
                  </Badge>
                </TD>
                <TD className="tabular-nums">{b.chunkCount}</TD>
                <TD>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deletingId === b.id}
                    onClick={() => void handleDelete(b.id)}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-4 text-error" />
                  </Button>
                </TD>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => !uploading && setUploadOpen(false)}
        title="Subir presupuesto histórico"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Subí un PDF, Word (.docx) o Excel (.xlsx) de hasta 15 MB. La IA va
            a extraer título, cliente, monto, fecha y el detalle del trabajo;
            después lo revisás antes de indexarlo.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,.docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-text file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-text hover:file:bg-border"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setUploadOpen(false)}
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button loading={uploading} onClick={() => void handleUpload()}>
              Subir y procesar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
