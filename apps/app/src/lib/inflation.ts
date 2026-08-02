import { prisma } from "@/lib/prisma";
import type { InflationIndex } from "@prisma/client";

/**
 * Ajuste por inflación (diferencial LATAM), pluggable por país/moneda.
 *
 * Fórmula (igual que ITZA, generalizada):
 *   montoActualizado = montoHistorico × ∏(1 + tasaMensual)
 * desde el MES SIGUIENTE al documento hasta el MES ANTERIOR al actual.
 *
 * El monto actualizado NUNCA se persiste: es un derivado que se recalcula en
 * runtime (cambiar un índice recalcula todo, sin migraciones).
 */

export interface InflationAdjustment {
  /** Factor multiplicador acumulado (1 = sin ajuste). */
  factor: number;
  /** Cantidad de meses con índice aplicado. */
  monthsApplied: number;
  /** True si faltaron índices en el rango (factor parcial). */
  incomplete: boolean;
}

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

/**
 * Función pura: calcula el factor acumulado desde `documentDate` hasta hoy,
 * con los índices ya cargados (evita N queries en loops del RAG).
 */
export function computeInflationFactor(
  documentDate: Date,
  indices: InflationIndex[],
  now: Date = new Date(),
): InflationAdjustment {
  // Rango: mes siguiente al documento → mes anterior al actual.
  let year = documentDate.getFullYear();
  let month = documentDate.getMonth() + 1 + 1; // mes siguiente (1-12 → +1)
  if (month > 12) {
    month = 1;
    year += 1;
  }
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1 - 1; // mes anterior al actual

  const byKey = new Map<string, number>();
  for (const idx of indices) {
    byKey.set(`${idx.year}-${idx.month}`, idx.monthlyRate);
  }

  let factor = 1;
  let monthsApplied = 0;
  let incomplete = false;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const rate = byKey.get(`${year}-${month}`);
    if (rate !== undefined) {
      factor *= 1 + rate;
      monthsApplied += 1;
    } else {
      incomplete = true;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return { factor, monthsApplied, incomplete };
}

/**
 * Ajusta un monto histórico a valor presente. Solo aplica si hay índices para
 * esa moneda (p. ej. ARS con IPC INDEC); USD/EUR sin índices → sin ajuste.
 */
export function adjustAmount(
  amount: number,
  documentDate: Date | null,
  indices: InflationIndex[],
  now: Date = new Date(),
): { adjusted: number; adjustment: InflationAdjustment | null } {
  if (!documentDate || indices.length === 0) {
    return { adjusted: amount, adjustment: null };
  }
  const adjustment = computeInflationFactor(documentDate, indices, now);
  return { adjusted: amount * adjustment.factor, adjustment };
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
