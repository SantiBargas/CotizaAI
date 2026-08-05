/**
 * Cálculo puro de ajuste por inflación — sin Prisma ni tipos de Prisma, safe
 * para importar desde componentes cliente (ej. filtros de /basedatos que
 * calculan "monto actualizado" en el browser con los índices ya cargados
 * por el servidor). `lib/inflation.ts` reexporta esto para el resto del
 * server (RAG, etc.) — un `InflationIndex[]` de Prisma satisface esta
 * interfaz estructuralmente, sin conversión.
 */

export interface InflationRateEntry {
  year: number;
  month: number;
  monthlyRate: number;
}

export interface InflationAdjustment {
  /** Factor multiplicador acumulado (1 = sin ajuste). */
  factor: number;
  /** Cantidad de meses con índice aplicado. */
  monthsApplied: number;
  /** True si faltaron índices en el rango (factor parcial). */
  incomplete: boolean;
}

/**
 * Función pura: calcula el factor acumulado desde `documentDate` hasta hoy,
 * con los índices ya cargados (evita N queries en loops del RAG).
 */
export function computeInflationFactor(
  documentDate: Date,
  indices: InflationRateEntry[],
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
  indices: InflationRateEntry[],
  now: Date = new Date(),
): { adjusted: number; adjustment: InflationAdjustment | null } {
  if (!documentDate || indices.length === 0) {
    return { adjusted: amount, adjustment: null };
  }
  const adjustment = computeInflationFactor(documentDate, indices, now);
  return { adjusted: amount * adjustment.factor, adjustment };
}
