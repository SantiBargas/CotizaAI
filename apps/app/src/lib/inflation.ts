import { prisma } from "@/lib/prisma";
import type { InflationIndex } from "@prisma/client";

export {
  computeInflationFactor,
  adjustAmount,
  type InflationAdjustment,
} from "@/lib/inflation-calc";

/**
 * Ajuste por inflación (diferencial LATAM), pluggable por país/moneda.
 *
 * Fórmula (igual que ITZA, generalizada):
 *   montoActualizado = montoHistorico × ∏(1 + tasaMensual)
 * desde el MES SIGUIENTE al documento hasta el MES ANTERIOR al actual.
 *
 * El monto actualizado NUNCA se persiste: es un derivado que se recalcula en
 * runtime (cambiar un índice recalcula todo, sin migraciones). El cálculo
 * puro vive en lib/inflation-calc.ts (sin Prisma, importable desde cliente).
 */

/** Carga los índices de un país/moneda ordenados (una sola query). */
export async function loadInflationIndices(
  country: string,
  currency: string,
): Promise<InflationIndex[]> {
  return prisma.inflationIndex.findMany({
    where: { country, currency },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Sync INDEC (adaptador AR/ARS; otros países se agregan como nuevos adapters)
// ────────────────────────────────────────────────────────────────────────────

/** Serie IPC Nacional nivel general, variación % mensual (datos.gob.ar). */
const INDEC_SERIES_ID = "148.3_INIVELNAL_DICI_M_26";
const INDEC_API =
  "https://apis.datos.gob.ar/series/api/series" +
  `?ids=${INDEC_SERIES_ID}&representation_mode=percent_change&format=json&limit=1000`;

export interface IndecSyncResult {
  upserted: number;
  latest: { year: number; month: number } | null;
}

/** Trae el IPC de INDEC y upserta los índices AR/ARS. Sin auth. */
export async function syncIndecIndices(): Promise<IndecSyncResult> {
  const res = await fetch(INDEC_API);
  if (!res.ok) {
    throw new Error(`API INDEC respondió ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: Array<[string, number | null]>;
  };
  const rows = json.data ?? [];

  let upserted = 0;
  let latest: { year: number; month: number } | null = null;

  for (const [dateStr, rate] of rows) {
    if (rate === null || !Number.isFinite(rate)) continue;
    const [y, m] = dateStr.split("-").map(Number);
    if (!y || !m) continue;
    await prisma.inflationIndex.upsert({
      where: {
        country_currency_year_month: {
          country: "AR",
          currency: "ARS",
          year: y,
          month: m,
        },
      },
      create: {
        country: "AR",
        currency: "ARS",
        year: y,
        month: m,
        monthlyRate: rate,
        source: "INDEC",
      },
      update: { monthlyRate: rate, source: "INDEC" },
    });
    upserted += 1;
    latest = { year: y, month: m };
  }

  return { upserted, latest };
}
