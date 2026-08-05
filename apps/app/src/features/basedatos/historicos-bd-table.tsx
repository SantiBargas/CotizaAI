"use client";

import Link from "next/link";
import { Badge, EmptyState, Table, TD, TH, THead, TRow } from "@cotizaai/ui";
import { FileText } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { adjustAmount, type InflationRateEntry } from "@/lib/inflation-calc";
import type { HistoricosGroup } from "@/lib/historicos/filters";
import { STATUS_LABELS, type HistoricalBudgetListItem } from "@/features/historicos/types";

const statusVariant: Record<
  HistoricalBudgetListItem["status"],
  "warning" | "success" | "neutral"
> = {
  PENDING_REVIEW: "warning",
  INDEXED: "success",
  ARCHIVED: "neutral",
};

/** Vista "BD" de /basedatos/presupuestos: grupos ya filtrados/ordenados de
 *  HistoricalBudget. Sin controles de carga (esos viven en /historicos). */
export function HistoricosBdTable({
  groups,
  showAdjustedAmount,
  indices,
}: {
  groups: HistoricosGroup<HistoricalBudgetListItem>[];
  showAdjustedAmount: boolean;
  indices: InflationRateEntry[];
}): React.ReactElement {
  const isEmpty = groups.every((g) => g.items.length === 0);
  if (isEmpty) {
    return (
      <EmptyState
        icon={<FileText className="size-10" />}
        title="Sin resultados"
        description="No hay históricos que coincidan con los filtros actuales."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label || "__all__"} className="flex flex-col gap-2">
          {group.label && (
            <p className="text-sm font-semibold text-text-heading">
              {group.label}{" "}
              <span className="font-normal text-text-muted">
                ({group.items.length})
              </span>
            </p>
          )}
          <Table>
            <THead>
              <tr>
                <TH>Título</TH>
                <TH>Cliente</TH>
                <TH>Monto</TH>
                {showAdjustedAmount && <TH>Monto actualizado</TH>}
                <TH>Fecha doc.</TH>
                <TH>Estado</TH>
                <TH>Chunks</TH>
              </tr>
            </THead>
            <tbody>
              {group.items.map((b) => {
                const adjusted =
                  showAdjustedAmount && b.amount !== null
                    ? adjustAmount(
                        b.amount,
                        b.documentDate ? new Date(b.documentDate) : null,
                        indices,
                      )
                    : null;
                return (
                  <TRow key={b.id}>
                    <TD>
                      <Link
                        href={`/historicos/${b.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {b.title}
                      </Link>
                      {b.createdByAI && (
                        <span className="ml-2 text-sm text-text-muted">· IA</span>
                      )}
                    </TD>
                    <TD>{b.client ?? "—"}</TD>
                    <TD className="tabular-nums">
                      {b.amount !== null
                        ? formatMoney(b.amount, b.currency)
                        : "—"}
                    </TD>
                    {showAdjustedAmount && (
                      <TD className="tabular-nums">
                        {adjusted
                          ? formatMoney(adjusted.adjusted, b.currency)
                          : "—"}
                      </TD>
                    )}
                    <TD>{b.documentDate ? formatDate(b.documentDate) : "—"}</TD>
                    <TD>
                      <Badge variant={statusVariant[b.status]}>
                        {STATUS_LABELS[b.status]}
                      </Badge>
                    </TD>
                    <TD className="tabular-nums">{b.chunkCount}</TD>
                  </TRow>
                );
              })}
            </tbody>
          </Table>
        </div>
      ))}
    </div>
  );
}
