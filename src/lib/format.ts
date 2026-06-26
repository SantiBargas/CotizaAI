/** Helpers de formato compartidos (montos, fechas) según locale del tenant. */

export function formatMoney(
  amount: number,
  currency: string = "ARS",
  locale: string = "es-AR",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(
  date: Date | string,
  locale: string = "es-AR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: string = "es-AR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** "Hace 5 min" / "Hace 2 d" — usado en listas de actividad reciente. */
export function formatRelativeTime(
  date: Date | string,
  locale: string = "es-AR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Hace instantes";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (seconds >= secondsInUnit) {
      return rtf.format(-Math.floor(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(-Math.floor(seconds / 60), "minute");
}
