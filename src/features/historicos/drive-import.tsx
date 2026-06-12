"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Search, Unplug } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface DriveFileItem {
  id: string;
  name: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Importación de PDFs desde el Google Drive del tenant.
 * - Sin conexión: botón "Conectar Google Drive" (OAuth).
 * - Conectado: modal con los PDFs del Drive (búsqueda + paginado) e importar.
 */
export function DriveImport({
  connected,
  accountEmail,
}: {
  connected: boolean;
  accountEmail: string | null;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadFiles = useCallback(
    async (q: string, pageToken?: string): Promise<void> => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (pageToken) params.set("pageToken", pageToken);
        const res = await fetch(
          `/api/integrations/google/files?${params.toString()}`,
        );
        const json = (await res.json()) as {
          files?: DriveFileItem[];
          nextPageToken?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "No se pudo listar Drive.");
        setFiles((prev) =>
          pageToken ? [...prev, ...(json.files ?? [])] : (json.files ?? []),
        );
        setNextPageToken(json.nextPageToken ?? null);
      } catch (err) {
        toast(
          "error",
          err instanceof Error ? err.message : "Error inesperado.",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  function openModal(): void {
    setOpen(true);
    setQuery("");
    void loadFiles("");
  }

  async function handleImport(file: DriveFileItem): Promise<void> {
    setImportingId(file.id);
    try {
      const res = await fetch("/api/historicos/import-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, fileName: file.name }),
      });
      const json = (await res.json()) as {
        budget?: { id: string };
        error?: string;
      };
      if (!res.ok || !json.budget) {
        throw new Error(json.error ?? "No se pudo importar el PDF.");
      }
      toast("success", `"${file.name}" importado. Revisá los datos extraídos.`);
      setOpen(false);
      router.push(`/historicos/${json.budget.id}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setImportingId(null);
    }
  }

  async function handleDisconnect(): Promise<void> {
    if (!window.confirm("¿Desconectar Google Drive de esta organización?")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google", {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo desconectar.");
      }
      toast("success", "Google Drive desconectado.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!connected) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          window.location.href = "/api/integrations/google/connect";
        }}
      >
        <CloudDownload className="size-4" />
        Conectar Google Drive
      </Button>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={openModal}>
        <CloudDownload className="size-4" />
        Importar de Drive
      </Button>

      <Modal
        open={open}
        onClose={() => importingId === null && setOpen(false)}
        title="Importar PDFs desde Google Drive"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="info">{accountEmail ?? "Cuenta conectada"}</Badge>
            <Button
              variant="ghost"
              size="sm"
              loading={disconnecting}
              onClick={() => void handleDisconnect()}
            >
              <Unplug className="size-4" />
              Desconectar
            </Button>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void loadFiles(query);
            }}
          >
            <Input
              value={query}
              placeholder="Buscar por nombre…"
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={loading}>
              <Search className="size-4" />
            </Button>
          </form>

          {loading && files.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-6 text-primary" />
            </div>
          ) : files.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              No se encontraron PDFs en tu Drive.
            </p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {f.name}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatSize(f.size)} · {formatDateTime(f.modifiedTime)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    loading={importingId === f.id}
                    disabled={importingId !== null && importingId !== f.id}
                    onClick={() => void handleImport(f)}
                  >
                    Importar
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {nextPageToken && (
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => void loadFiles(query, nextPageToken)}
            >
              Cargar más
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
