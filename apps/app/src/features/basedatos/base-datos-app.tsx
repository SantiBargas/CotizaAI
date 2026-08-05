"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FolderTree, ShieldCheck, TrendingUp } from "lucide-react";
import { PresupuestosHistoricosScreen } from "./presupuestos-historicos-screen";
import { HistoricosAuditPanel } from "@/features/historicos/historicos-audit-panel";
import { InflacionTable, type InflacionIndexRow } from "./inflacion-table";
import type { HistoricalBudgetListItem } from "@/features/historicos/types";

type Section = "presupuestos" | "auditoria" | "inflacion";
type View = "dashboard" | Section;

const TILES: Array<{
  view: Section;
  title: string;
  description: string;
  icon: typeof FolderTree;
  accent: string;
  iconClass: string;
}> = [
  {
    view: "presupuestos",
    title: "Presupuestos históricos",
    description:
      "Curá la base que alimenta el RAG: navegá tu Drive por carpetas e importá PDFs, o revisá lo ya cargado.",
    icon: FolderTree,
    accent: "border-t-brand-aqua",
    iconClass: "bg-brand-aqua/10 text-brand-aqua",
  },
  {
    view: "auditoria",
    title: "Auditoría de calidad",
    description:
      "Duplicados, títulos raros y datos incompletos antes de que contaminen el RAG.",
    icon: ShieldCheck,
    accent: "border-t-brand-blue",
    iconClass: "bg-brand-blue/10 text-brand-blue",
  },
  {
    view: "inflacion",
    title: "Índices de inflación",
    description:
      "Historial completo de índices que ajustan los montos históricos a valor de hoy.",
    icon: TrendingUp,
    accent: "border-t-brand-orange",
    iconClass: "bg-brand-orange/10 text-brand-orange",
  },
];

function isSection(v: string | null): v is Section {
  return v === "presupuestos" || v === "auditoria" || v === "inflacion";
}

/**
 * Shell de /basedatos: una sola pantalla client-side, mismo patrón que
 * BaseDatosScreen de ITZA. Cambiar de módulo es estado de React (`view`),
 * no una navegación de Next — cero requests, instantáneo. Todos los datos
 * (históricos, estado de Drive, índices) se cargan una sola vez en el
 * server component padre y llegan acá como props.
 */
export function BaseDatosApp({
  budgets,
  driveConnected,
  indices,
  country,
  currency,
}: {
  budgets: HistoricalBudgetListItem[];
  driveConnected: boolean;
  indices: InflacionIndexRow[];
  country: string;
  currency: string;
}): React.ReactElement {
  const searchParams = useSearchParams();
  const deepLink = searchParams.get("view");
  const [view, setView] = useState<View>(
    isSection(deepLink) ? deepLink : "dashboard",
  );

  // Presupuestos históricos tiene su propia barra de herramientas (incluye
  // su botón de "volver"), que además suplanta al nav principal — no la
  // envolvemos en el wrapper genérico de abajo.
  if (view === "presupuestos") {
    return (
      <PresupuestosHistoricosScreen
        budgets={budgets}
        driveConnected={driveConnected}
        indices={indices}
        onBack={() => setView("dashboard")}
      />
    );
  }

  if (view !== "dashboard") {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setView("dashboard")}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-muted hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Base de datos
        </button>
        {view === "auditoria" && <HistoricosAuditPanel />}
        {view === "inflacion" && (
          <InflacionTable indices={indices} country={country} currency={currency} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-heading">
          Base de datos
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Panel de administración: fuentes y calidad de los datos que usa la IA.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.view}
              type="button"
              onClick={() => setView(tile.view)}
              className={`group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border border-t-4 ${tile.accent} bg-surface-elevated p-6 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]`}
            >
              <span
                className={`flex size-10 items-center justify-center rounded-[var(--radius-md)] ${tile.iconClass}`}
              >
                <Icon className="size-5" />
              </span>
              <span className="text-base font-semibold text-text-heading">
                {tile.title}
              </span>
              <span className="text-sm text-text-muted">
                {tile.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
