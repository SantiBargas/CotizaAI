"use client";

import { Button } from "@cotizaai/ui";

/** Barra flotante de importación batch — aparece cuando hay archivos de
 *  Drive seleccionados en el árbol. Fetch secuencial (ver screen padre), sin
 *  SSE: cada import ya corre dentro de su propio límite de función. */
export function BatchImportBar({
  count,
  importing,
  progress,
  onClear,
  onImportAll,
}: {
  count: number;
  importing: boolean;
  progress: { done: number; total: number } | null;
  onClear: () => void;
  onImportAll: () => void;
}): React.ReactElement | null {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-primary/40 bg-surface-elevated px-4 py-3 shadow-[var(--shadow-md)]">
      <span className="text-sm font-medium text-text">
        {progress
          ? `Importando ${progress.done} de ${progress.total}…`
          : `${count} archivo(s) seleccionado(s)`}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={importing}>
          Limpiar
        </Button>
        <Button size="sm" loading={importing} onClick={onImportAll}>
          Importar seleccionados
        </Button>
      </div>
    </div>
  );
}
