"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CloudOff,
  Folder,
  FolderTree,
  Info,
  List,
  RefreshCw,
} from "lucide-react";
import { cn, useToast } from "@cotizaai/ui";
import {
  setNavHidden,
  useHeaderSlotEl,
} from "@/features/nav/nav-visibility";
import { InflacionSync } from "@/features/configuracion/inflacion-sync";
import { UploadHistoricoButton } from "./upload-historico-button";
import { DriveTree, type DriveFileNode } from "./drive-tree";
import { HistoricosFiltersBar } from "./historicos-filters-bar";
import { HistoricosBdTable } from "./historicos-bd-table";
import { BatchImportBar } from "./batch-import-bar";
import {
  DEFAULT_HISTORICOS_FILTERS,
  filterDriveFiles,
  filterHistoricalBudgets,
  groupHistoricalBudgets,
  type HistoricosFiltersState,
} from "@/lib/historicos/filters";
import type { InflationRateEntry } from "@/lib/inflation-calc";
import type { HistoricalBudgetListItem } from "@/features/historicos/types";

type View = "drive" | "bd";

function isPlanLimitMessage(message: string): boolean {
  return message.toLowerCase().includes("límite de históricos de tu plan");
}

export function PresupuestosHistoricosScreen({
  budgets,
  driveConnected,
  indices,
  onBack,
}: {
  budgets: HistoricalBudgetListItem[];
  driveConnected: boolean;
  indices: InflationRateEntry[];
  onBack: () => void;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<View>(driveConnected ? "drive" : "bd");

  // Este módulo tiene su propia barra de herramientas, portada DENTRO del
  // header real (mismo fondo/sticky/ancho) en vez del nav normal — mismo
  // patrón que ITZA para pantallas admin de trabajo full-screen. Se
  // restaura al desmontar (salir del módulo).
  const headerSlotEl = useHeaderSlotEl();
  useEffect(() => {
    setNavHidden(true);
    return () => setNavHidden(false);
  }, []);
  const [filters, setFilters] = useState<HistoricosFiltersState>(
    DEFAULT_HISTORICOS_FILTERS,
  );
  const [selected, setSelected] = useState<Map<string, DriveFileNode>>(
    new Map(),
  );
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [structureResetKey, setStructureResetKey] = useState(0);
  const [rootDriveFiles, setRootDriveFiles] = useState<DriveFileNode[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);

  const currencies = useMemo(
    () => Array.from(new Set(budgets.map((b) => b.currency))).sort(),
    [budgets],
  );
  const filteredBudgets = useMemo(
    () => filterHistoricalBudgets(budgets, filters, indices),
    [budgets, filters, indices],
  );
  const groupedBudgets = useMemo(
    () => groupHistoricalBudgets(filteredBudgets, filters.groupBy),
    [filteredBudgets, filters.groupBy],
  );
  const filteredRootDriveFiles = useMemo(
    () => filterDriveFiles(rootDriveFiles, filters),
    [rootDriveFiles, filters],
  );
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const indexedCount = useMemo(
    () => budgets.filter((b) => b.chunkCount > 0).length,
    [budgets],
  );

  function toggleSelect(file: DriveFileNode): void {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.set(file.id, file);
      return next;
    });
  }

  /** Un solo intento de import; devuelve el error (string) si falló, o null
   *  si salió bien. Distingue rate-limit (reintentable) de límite de plan
   *  (corta el batch). */
  async function importOnce(
    file: DriveFileNode,
  ): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
    try {
      const res = await fetch("/api/historicos/import-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, fileName: file.name }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        const error = json.error ?? `No se pudo importar "${file.name}".`;
        return { ok: false, error, retryable: res.status === 429 && !isPlanLimitMessage(error) };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Error inesperado.",
        retryable: false,
      };
    }
  }

  async function handleImportOne(file: DriveFileNode): Promise<void> {
    setImportingIds((prev) => new Set(prev).add(file.id));
    const result = await importOnce(file);
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(file.id);
      return next;
    });
    if (result.ok) {
      toast("success", `"${file.name}" importado.`);
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(file.id);
        return next;
      });
      router.refresh();
    } else {
      toast("error", result.error);
    }
  }

  async function handleImportBatch(): Promise<void> {
    const files = [...selected.values()];
    if (files.length === 0) return;
    setBatchImporting(true);
    setBatchProgress({ done: 0, total: files.length });

    for (const file of files) {
      setImportingIds((prev) => new Set(prev).add(file.id));
      let result = await importOnce(file);
      if (!result.ok && result.retryable) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        result = await importOnce(file);
      }
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });

      if (result.ok) {
        setSelected((prev) => {
          const next = new Map(prev);
          next.delete(file.id);
          return next;
        });
      } else {
        toast("error", result.error);
        if (isPlanLimitMessage(result.error)) break; // corta el batch temprano
      }

      setBatchProgress((prev) =>
        prev ? { done: prev.done + 1, total: prev.total } : prev,
      );
    }

    setBatchImporting(false);
    setBatchProgress(null);
    router.refresh();
  }

  const toolbar = (
    <div className="flex w-full flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Base de datos
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-brand-aqua/10 text-brand-aqua">
          <FolderTree className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-heading">
            Presupuestos históricos
          </p>
          <p className="truncate text-sm text-text-muted">
            HistoricalBudget · memoria RAG
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setView("drive")}
          disabled={!driveConnected}
          className={cn(
            "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            view === "drive"
              ? "bg-primary text-primary-fg"
              : "text-text-muted hover:text-text",
          )}
        >
          <Folder className="size-4" />
          Drive
        </button>
        <button
          type="button"
          onClick={() => setView("bd")}
          className={cn(
            "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
            view === "bd"
              ? "bg-primary text-primary-fg"
              : "text-text-muted hover:text-text",
          )}
        >
          <List className="size-4" />
          BD ({budgets.length})
        </button>
      </div>

      {view === "drive" && driveConnected && (
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              title="Estadísticas de la base"
              className="flex size-8 items-center justify-center rounded-[var(--radius-md)] border border-border text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <Info className="size-4" />
            </button>
            {infoOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setInfoOpen(false)}
                  aria-hidden
                />
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 w-64 rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-3 shadow-[var(--shadow-lg)]">
                  <p className="mb-1.5 text-sm font-semibold text-text-heading">
                    Base de históricos
                  </p>
                  <p className="text-sm text-text-muted">
                    <span className="font-semibold text-text">{budgets.length}</span> en BD
                  </p>
                  <p className="text-sm text-text-muted">
                    <span className="font-semibold text-text">{indexedCount}</span> con embedding (RAG ready)
                  </p>
                  <p className="text-sm text-text-muted">
                    <span className="font-semibold text-text">{rootDriveFiles.length}</span> archivos en la carpeta actual de Drive
                  </p>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStructureResetKey((k) => k + 1)}
            title="Vuelve a leer la carpeta desde Drive, descartando lo cacheado"
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <RefreshCw className="size-4" />
            Actualizar estructura
          </button>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <InflacionSync />
        <UploadHistoricoButton />
      </div>
    </div>
  );

  const resumen =
    view === "drive"
      ? { total: rootDriveFiles.length, filtered: filteredRootDriveFiles.length }
      : { total: budgets.length, filtered: filteredBudgets.length };

  return (
    <div className="flex flex-col gap-4">
      {headerSlotEl && createPortal(toolbar, headerSlotEl)}

      <HistoricosFiltersBar
        view={view}
        value={filters}
        onChange={setFilters}
        currencies={currencies}
        resumen={resumen}
      />

      {view === "drive" ? (
        driveConnected ? (
          <DriveTree
            filters={filters}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onImportOne={(file) => void handleImportOne(file)}
            importingIds={importingIds}
            resetKey={structureResetKey}
            onRootFilesChange={setRootDriveFiles}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-14 text-center">
            <CloudOff className="size-8 text-text-muted" />
            <p className="text-sm text-text-muted">
              Conectá Google Drive desde{" "}
              <Link href="/historicos" className="text-primary hover:underline">
                Históricos
              </Link>{" "}
              para navegar tus carpetas acá.
            </p>
          </div>
        )
      ) : (
        <HistoricosBdTable
          groups={groupedBudgets}
          showAdjustedAmount={filters.amountField === "adjusted"}
          indices={indices}
        />
      )}

      {view === "drive" && (
        <BatchImportBar
          count={selected.size}
          importing={batchImporting}
          progress={batchProgress}
          onClear={() => setSelected(new Map())}
          onImportAll={() => void handleImportBatch()}
        />
      )}
    </div>
  );
}
