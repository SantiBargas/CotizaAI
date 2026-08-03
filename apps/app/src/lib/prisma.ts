import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Cliente Prisma singleton (driver adapter pg). NUNCA instanciar
 * `new PrismaClient()` en otro lado. No importar en middleware (rompe Edge).
 *
 * Prisma 7: el pool lo maneja este adapter directamente (no el motor
 * interno) — `connection_limit`/`pgbouncer=true` en la connection string ya
 * no tiene efecto, el pool se configura acá. `connectionTimeoutMillis` es lo
 * importante: sin esto, node-postgres espera indefinido si el pool está
 * saturado (con la DB en Oregón, un pico de tráfico se sentiría como
 * requests colgados varios minutos) en vez de fallar rápido y legible.
 */
const adapter = new PrismaPg(
  {
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  },
  {
    onPoolError: (err) =>
      console.error("[prisma] Error en el pool de conexiones:", err.message),
    onConnectionError: (err) =>
      console.error("[prisma] Conexión a Postgres perdida:", err.message),
  },
);

function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter });
}

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * En desarrollo, `global.prisma` puede quedar con un `PrismaClient` generado
 * ANTES de correr `prisma generate` tras agregar un modelo (Fast Refresh no
 * reinstancia el singleton). Ese cliente no tiene el delegate del modelo
 * nuevo y rompe con `undefined.create`. Si falta, desconectamos y
 * recreamos — `tenantIntegration` es el modelo agregado más recientemente;
 * actualizar este chequeo si se agrega uno más nuevo.
 */
function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    const stale =
      globalThis.prisma &&
      typeof (globalThis.prisma as unknown as { tenantIntegration?: unknown })
        .tenantIntegration === "undefined";
    if (stale) {
      void globalThis.prisma?.$disconnect().catch(() => {});
      globalThis.prisma = undefined;
    }
  }
  if (!globalThis.prisma) {
    globalThis.prisma = createPrismaClient();
  }
  return globalThis.prisma;
}

/** Proxy para que cada acceso pase por getPrismaClient() y aplique la invalidación en dev. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
