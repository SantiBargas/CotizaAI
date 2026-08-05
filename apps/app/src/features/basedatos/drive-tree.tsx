"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, File, Folder } from "lucide-react";
import { Badge, Button, Spinner, useToast } from "@cotizaai/ui";
import { filterDriveFiles } from "@/lib/historicos/filters";
import type { HistoricosFiltersState } from "@/lib/historicos/filters";

export interface DriveFileNode {
  id: string;
  name: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
  imported: boolean;
  historicalBudgetId: string | null;
}

interface DriveFolderNode {
  id: string;
  name: string;
}

interface FolderState {
  folders: DriveFolderNode[];
  files: DriveFileNode[];
  loading: boolean;
}

interface DriveTreeContextValue {
  cache: Map<string, FolderState>;
  expanded: Set<string>;
  toggleExpand: (folderId: string) => void;
  filters: HistoricosFiltersState;
  selectedIds: Set<string>;
  onToggleSelect: (file: DriveFileNode) => void;
  onImportOne: (file: DriveFileNode) => void;
  importingIds: Set<string>;
}

const DriveTreeContext = createContext<DriveTreeContextValue | null>(null);

function useDriveTree(): DriveTreeContextValue {
  const ctx = useContext(DriveTreeContext);
  if (!ctx) throw new Error("Debe usarse dentro de <DriveTree>.");
  return ctx;
}

/**
 * Árbol de carpetas de Google Drive con lazy-load por carpeta (fetch solo la
 * primera vez que se expande, cacheado en memoria mientras el componente
 * vive — igual al patrón de /basedatositza en ITZA, adaptado a Next). La
 * selección de archivos vive en el screen padre (la necesita la barra de
 * importación batch de Fase 4), no acá.
 */
export function DriveTree({
  filters,
  selectedIds,
  onToggleSelect,
  onImportOne,
  importingIds,
  resetKey,
  onRootFilesChange,
}: {
  filters: HistoricosFiltersState;
  selectedIds: Set<string>;
  onToggleSelect: (file: DriveFileNode) => void;
  onImportOne: (file: DriveFileNode) => void;
  importingIds: Set<string>;
  /** Cambiar este valor fuerza a re-leer todo desde cero ("Actualizar estructura"). */
  resetKey?: number;
  /** Se dispara con los archivos de la carpeta raíz cada vez que cambian —
   *  el screen padre lo usa para el resumen de la barra de filtros. */
  onRootFilesChange?: (files: DriveFileNode[]) => void;
}): React.ReactElement {
  const { toast } = useToast();
  const [cache, setCache] = useState<Map<string, FolderState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["root"]));

  async function loadFolder(folderId: string): Promise<void> {
    setCache((prev) => {
      const next = new Map(prev);
      next.set(folderId, { folders: [], files: [], loading: true });
      return next;
    });
    try {
      const res = await fetch(
        `/api/integrations/google/folder-children?folderId=${encodeURIComponent(folderId)}`,
      );
      const json = (await res.json()) as {
        folders?: DriveFolderNode[];
        files?: DriveFileNode[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "No se pudo listar Drive.");
      setCache((prev) => {
        const next = new Map(prev);
        next.set(folderId, {
          folders: json.folders ?? [],
          files: json.files ?? [],
          loading: false,
        });
        return next;
      });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
      setCache((prev) => {
        const next = new Map(prev);
        next.delete(folderId); // permite reintentar al volver a expandir
        return next;
      });
    }
  }

  useEffect(() => {
    // setTimeout (no fetch directo): todo lo de abajo llama a setState de
    // forma síncrona, y hacerlo inline acá dispararía un set-state síncrono
    // dentro del efecto. Corre al montar Y cada vez que cambia resetKey
    // ("Actualizar estructura" descarta todo lo cacheado).
    const id = setTimeout(() => {
      setCache(new Map());
      setExpanded(new Set(["root"]));
      void loadFolder("root");
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    onRootFilesChange?.(cache.get("root")?.files ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache]);

  function toggleExpand(folderId: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
        if (!cache.has(folderId)) void loadFolder(folderId);
      }
      return next;
    });
  }

  const value: DriveTreeContextValue = {
    cache,
    expanded,
    toggleExpand,
    filters,
    selectedIds,
    onToggleSelect,
    onImportOne,
    importingIds,
  };

  return (
    <DriveTreeContext.Provider value={value}>
      <div className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-2">
        <DriveTreeFolderNode folderId="root" name="Mi unidad" depth={0} />
      </div>
    </DriveTreeContext.Provider>
  );
}

function DriveTreeFolderNode({
  folderId,
  name,
  depth,
}: {
  folderId: string;
  name: string;
  depth: number;
}): React.ReactElement {
  const { cache, expanded, toggleExpand, filters } = useDriveTree();
  const state = cache.get(folderId);
  const isExpanded = expanded.has(folderId);
  const visibleFiles = state ? filterDriveFiles(state.files, filters) : [];

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleExpand(folderId)}
        className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-surface"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <Folder className="size-4 shrink-0 text-brand-blue" />
        <span className="truncate font-medium text-text">{name}</span>
        {state?.loading && <Spinner className="ml-auto size-3.5" />}
      </button>

      {isExpanded && state && !state.loading && (
        <div>
          {state.folders.map((f) => (
            <DriveTreeFolderNode
              key={f.id}
              folderId={f.id}
              name={f.name}
              depth={depth + 1}
            />
          ))}
          {visibleFiles.map((file) => (
            <DriveTreeFileRow key={file.id} file={file} depth={depth + 1} />
          ))}
          {state.folders.length === 0 && visibleFiles.length === 0 && (
            <p
              className="px-2 py-1.5 text-sm text-text-muted"
              style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.5}rem` }}
            >
              Carpeta vacía.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DriveTreeFileRow({
  file,
  depth,
}: {
  file: DriveFileNode;
  depth: number;
}): React.ReactElement {
  const { selectedIds, onToggleSelect, onImportOne, importingIds } =
    useDriveTree();
  const isImporting = importingIds.has(file.id);

  return (
    <div
      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-surface"
      style={{ paddingLeft: `${depth * 1.25 + 1.75}rem` }}
    >
      {!file.imported && (
        <input
          type="checkbox"
          checked={selectedIds.has(file.id)}
          onChange={() => onToggleSelect(file)}
          className="size-3.5 shrink-0"
        />
      )}
      <File className="size-4 shrink-0 text-text-muted" />
      <span className="truncate text-text">{file.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {file.imported ? (
          <Link href={`/historicos/${file.historicalBudgetId}`}>
            <Badge variant="success">Importado</Badge>
          </Link>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            loading={isImporting}
            onClick={() => onImportOne(file)}
          >
            Importar
          </Button>
        )}
      </span>
    </div>
  );
}
