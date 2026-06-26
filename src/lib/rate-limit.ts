/**
 * Rate limiting básico en memoria (ventana fija), sin Redis/KV.
 *
 * ADVERTENCIA IMPORTANTE: este limiter vive en la memoria del proceso. En
 * Vercel (serverless) cada instancia tiene su propio estado y un cold start
 * lo reinicia en cero — esto NO protege de abuso distribuido entre múltiples
 * instancias, solo es una primera barrera contra abuso simple desde una
 * misma instancia caliente. Para producción real con tráfico multi-instancia
 * habría que migrar a Upstash Redis o Vercel KV (contador atómico compartido
 * con TTL). Documentado como deuda conocida — no es la solución definitiva.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 60_000; // 1 minuto
const DEFAULT_MAX = 20; // 20 requests por ventana

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Chequea (y consume) un request contra el límite de `key` en una ventana
 * fija de `windowMs` ms, permitiendo como máximo `max` requests por ventana.
 */
export function checkRateLimit(
  key: string,
  opts?: { windowMs?: number; max?: number },
): RateLimitResult {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const max = opts?.max ?? DEFAULT_MAX;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count < max) {
    bucket.count += 1;
    return { allowed: true };
  }

  const retryAfterMs = windowMs - (now - bucket.windowStart);
  return { allowed: false, retryAfterMs };
}

// Limpieza periódica para no acumular buckets viejos indefinidamente en
// instancias de larga vida (no aplica en serverless, pero no hace daño).
const CLEANUP_INTERVAL_MS = 10 * 60_000;
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > DEFAULT_WINDOW_MS * 10) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // No bloquear el cierre del proceso por este timer.
  if (typeof timer.unref === "function") timer.unref();
}
