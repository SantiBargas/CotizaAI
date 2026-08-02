/**
 * Logging estructurado mínimo (sin dependencias externas, deliberadamente
 * simple). Centraliza el formato de los logs de error/advertencia para que
 * sean fáciles de grepear/parsear (JSON por línea) en cualquier proveedor de
 * logs (Vercel, etc.) sin necesidad de integrar Sentry u otro servicio.
 */

function serializeError(err: unknown): { message: string; stack?: string } {
  return {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  };
}

/** Log de error con contexto estructurado. Nunca lanza. */
export function logError(
  context: string,
  err: unknown,
  meta?: Record<string, unknown>,
): void {
  console.error(
    JSON.stringify({
      level: "error",
      context,
      ...serializeError(err),
      ...meta,
      timestamp: new Date().toISOString(),
    }),
  );
}

/** Log de advertencia (degradación/fallback) con contexto estructurado. Nunca lanza. */
export function logWarn(
  context: string,
  err: unknown,
  meta?: Record<string, unknown>,
): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      context,
      ...serializeError(err),
      ...meta,
      timestamp: new Date().toISOString(),
    }),
  );
}
