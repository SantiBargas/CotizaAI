"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Modal, useToast } from "@cotizaai/ui";

/** Botón "+ Nuevo" — sube un histórico a mano sin pasar por Drive. Mismo
 *  endpoint y flujo que el upload de /historicos (extrae con IA → revisión). */
export function UploadHistoricoButton(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      setOpen(false);
      router.push(`/historicos/${json.budget.id}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nuevo
      </Button>
      <Modal
        open={open}
        onClose={() => !uploading && setOpen(false)}
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
              onClick={() => setOpen(false)}
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
    </>
  );
}
