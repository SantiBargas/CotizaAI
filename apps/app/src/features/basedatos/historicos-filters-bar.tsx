"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn, Input, Select } from "@cotizaai/ui";
import { STATUS_LABELS } from "@/features/historicos/types";
import {
  DEFAULT_HISTORICOS_FILTERS,
  hasActiveFilters,
  type FileType,
  type HistoricosFiltersState,
} from "@/lib/historicos/filters";

const FILE_TYPES: Array<{ value: FileType; label: string }> = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "DOCX" },
  { value: "xlsx", label: "XLSX" },
];

/**
 * Barra de búsqueda + popover de filtros/orden/agrupación, compartida entre
 * las vistas Drive y BD de /basedatos/presupuestos — mismo patrón que la
 * barra de ITZA (búsqueda siempre visible, filtros avanzados en popover).
 * Todo el texto en text-sm (mismo tamaño que el buscador), sin excepciones.
 */
export function HistoricosFiltersBar({
  view,
  value,
  onChange,
  currencies,
  resumen,
}: {
  view: "drive" | "bd";
  value: HistoricosFiltersState;
  onChange: (next: HistoricosFiltersState) => void;
  currencies: string[];
  resumen: { total: number; filtered: number };
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const active = hasActiveFilters(value);

  function set<K extends keyof HistoricosFiltersState>(
    key: K,
    v: HistoricosFiltersState[K],
  ): void {
    onChange({ ...value, [key]: v });
  }

  function toggleFileType(type: FileType): void {
    set(
      "fileTypes",
      value.fileTypes.includes(type)
        ? value.fileTypes.filter((t) => t !== type)
        : [...value.fileTypes, type],
    );
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-md)] border bg-surface-elevated px-2 py-1.5",
          open ? "border-primary ring-2 ring-primary/25" : "border-border",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-medium transition-colors",
            active ? "text-primary" : "text-text-muted hover:text-text",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
        </button>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={value.query}
            placeholder={
              view === "drive"
                ? "Buscar por nombre de archivo…"
                : "Buscar por título o cliente…"
            }
            className="border-0 bg-transparent pl-8 text-sm shadow-none focus:ring-0"
            onChange={(e) => set("query", e.target.value)}
          />
        </div>

        <span className="shrink-0 text-sm text-text-muted">
          {active ? `${resumen.filtered} de ${resumen.total}` : resumen.total}
        </span>

        {active && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_HISTORICOS_FILTERS)}
            title="Limpiar filtros"
            className="shrink-0 rounded-[var(--radius-sm)] p-1 text-text-muted hover:bg-surface hover:text-error"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-20 grid w-full max-w-2xl grid-cols-1 divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-lg)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* Columna 1: Filtros */}
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-text-heading">
                  Tipo de archivo
                </p>
                <div className="flex flex-wrap gap-2">
                  {FILE_TYPES.map((ft) => (
                    <button
                      key={ft.value}
                      type="button"
                      onClick={() => toggleFileType(ft.value)}
                      className={cn(
                        "rounded-[var(--radius-full)] border px-3 py-1 text-sm font-medium transition-colors",
                        value.fileTypes.includes(ft.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-text-muted hover:text-text",
                      )}
                    >
                      {ft.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-text-heading">
                  {view === "drive" ? "Estado en base de datos" : "Estado"}
                </p>
                <Select
                  value={value.status}
                  className="text-sm"
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="all">Todos</option>
                  {view === "drive" ? (
                    <>
                      <option value="imported">Importados</option>
                      <option value="pending">Pendientes</option>
                    </>
                  ) : (
                    Object.entries(STATUS_LABELS).map(([status, label]) => (
                      <option key={status} value={status}>
                        {label}
                      </option>
                    ))
                  )}
                </Select>
              </div>

              {view === "bd" && (
                <>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-text-heading">
                      Moneda
                    </p>
                    <Select
                      value={value.currency}
                      className="text-sm"
                      onChange={(e) => set("currency", e.target.value)}
                    >
                      <option value="">Todas</option>
                      {currencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-text-heading">
                        Rango de monto
                      </p>
                      <div className="flex rounded-[var(--radius-sm)] border border-border p-0.5">
                        <button
                          type="button"
                          onClick={() => set("amountField", "historical")}
                          className={cn(
                            "rounded-[var(--radius-sm)] px-2 py-0.5 text-sm font-medium",
                            value.amountField === "historical"
                              ? "bg-primary text-primary-fg"
                              : "text-text-muted",
                          )}
                        >
                          Histórico
                        </button>
                        <button
                          type="button"
                          onClick={() => set("amountField", "adjusted")}
                          title="Ajustado por los índices de inflación cargados"
                          className={cn(
                            "rounded-[var(--radius-sm)] px-2 py-0.5 text-sm font-medium",
                            value.amountField === "adjusted"
                              ? "bg-primary text-primary-fg"
                              : "text-text-muted",
                          )}
                        >
                          Actualizado
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={value.amountMin}
                        placeholder="Mín."
                        className="text-sm"
                        onChange={(e) => set("amountMin", e.target.value)}
                      />
                      <span className="text-sm text-text-muted">a</span>
                      <Input
                        type="number"
                        value={value.amountMax}
                        placeholder="Máx."
                        className="text-sm"
                        onChange={(e) => set("amountMax", e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-text-heading">
                  Embedding (RAG)
                </p>
                <Select
                  value={value.embedding}
                  className="text-sm"
                  onChange={(e) =>
                    set(
                      "embedding",
                      e.target.value as HistoricosFiltersState["embedding"],
                    )
                  }
                >
                  <option value="all">Todos</option>
                  <option value="with">Con embedding (RAG ready)</option>
                  <option value="without">Sin embedding</option>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-text-heading">
                  Fecha del documento
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {(
                    [
                      { value: "none", label: "Sin filtro" },
                      { value: "last30", label: "Últimos 30 días" },
                      { value: "thisYear", label: "Este año" },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        set("datePreset", preset.value);
                        set("dateFrom", "");
                        set("dateTo", "");
                      }}
                      className={cn(
                        "rounded-[var(--radius-full)] border px-3 py-1 text-sm font-medium transition-colors",
                        value.datePreset === preset.value &&
                          !value.dateFrom &&
                          !value.dateTo
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-text-muted hover:text-text",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={value.dateFrom}
                    className="text-sm"
                    onChange={(e) => {
                      set("dateFrom", e.target.value);
                      set("datePreset", "none");
                    }}
                  />
                  <span className="text-sm text-text-muted">a</span>
                  <Input
                    type="date"
                    value={value.dateTo}
                    className="text-sm"
                    onChange={(e) => {
                      set("dateTo", e.target.value);
                      set("datePreset", "none");
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Columna 2: Ordenar + Agrupar + Resumen */}
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-text-heading">
                  Ordenar por
                </p>
                <Select
                  value={value.sortBy}
                  className="text-sm"
                  onChange={(e) =>
                    set(
                      "sortBy",
                      e.target.value as HistoricosFiltersState["sortBy"],
                    )
                  }
                >
                  <option value="recent">Más recientes</option>
                  <option value="name">Nombre (A-Z)</option>
                  {view === "bd" && (
                    <>
                      <option value="amount-desc">Monto (mayor a menor)</option>
                      <option value="amount-asc">Monto (menor a mayor)</option>
                    </>
                  )}
                </Select>
              </div>

              {view === "bd" && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-text-heading">
                    Agrupar por
                  </p>
                  <Select
                    value={value.groupBy}
                    className="text-sm"
                    onChange={(e) =>
                      set(
                        "groupBy",
                        e.target.value as HistoricosFiltersState["groupBy"],
                      )
                    }
                  >
                    <option value="none">Sin agrupar</option>
                    <option value="client">Cliente</option>
                    <option value="date">Fecha del documento</option>
                  </Select>
                </div>
              )}

              <div className="mt-auto border-t border-border pt-3">
                <p className="mb-1.5 text-sm font-semibold text-text-heading">
                  Resumen
                </p>
                <p className="text-sm text-text-muted">
                  <span className="font-semibold text-text">
                    {resumen.total}
                  </span>{" "}
                  {view === "drive" ? "archivo(s) en esta carpeta" : "registros en BD"}
                </p>
                {active && (
                  <p className="text-sm text-primary">
                    <span className="font-semibold">{resumen.filtered}</span>{" "}
                    resultado{resumen.filtered !== 1 ? "s" : ""} con filtros
                    actuales
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
