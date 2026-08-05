import { Card, EmptyState, Table, TD, TH, THead, TRow } from "@cotizaai/ui";
import { InflacionSync } from "@/features/configuracion/inflacion-sync";

export interface InflacionIndexRow {
  id: string;
  year: number;
  month: number;
  monthlyRate: number;
  source: string | null;
}

/** Tabla completa de índices de inflación — presentacional, recibe los datos
 *  ya cargados por el server component padre (sin fetch propio). */
export function InflacionTable({
  indices,
  country,
  currency,
}: {
  indices: InflacionIndexRow[];
  country: string;
  currency: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-heading">
            Índices de inflación
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {country}/{currency} — ajustan los montos históricos a valor de
            hoy en la generación.
          </p>
        </div>
        <InflacionSync />
      </div>

      <Card>
        {indices.length === 0 ? (
          <EmptyState
            title="Sin índices cargados"
            description="Sincronizá el IPC de INDEC para empezar a ajustar los montos históricos."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Año</TH>
                <TH>Mes</TH>
                <TH>% mensual</TH>
                <TH>Fuente</TH>
              </tr>
            </THead>
            <tbody>
              {indices.map((i) => (
                <TRow key={i.id}>
                  <TD className="tabular-nums">{i.year}</TD>
                  <TD className="tabular-nums">{i.month}</TD>
                  <TD className="tabular-nums">
                    {(i.monthlyRate * 100).toFixed(2)}%
                  </TD>
                  <TD>{i.source ?? "—"}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
