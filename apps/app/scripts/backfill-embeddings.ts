import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { embedText, isEmbeddingConfigured, toPgVectorLiteral } from "../src/lib/ai/embeddings";

/**
 * Reindexado masivo de embeddings (docs/tareas.md M.1): recorre los
 * `BudgetChunk` sin vector (de todos los tenants, o de uno solo con
 * `--tenant=<uuid>`) y los regenera. Idempotente — seguro de re-correr.
 * Necesario al activar embeddings por primera vez o al migrar de proveedor
 * (Gemini ↔ OpenAI), ya que cambiar de proveedor no recalcula los vectores
 * existentes automáticamente.
 *
 * Uso: npx tsx scripts/backfill-embeddings.ts [--tenant=<uuid>]
 *
 * Nota sobre el alias `@/`: tsx no resuelve el path mapping de tsconfig.json
 * (ver scripts/test-presupuesto.ts) — por eso este script importa con rutas
 * relativas a `src/`.
 */

const RATE_LIMIT_MS = 700; // mismo delay documentado para ITZA (free tier Gemini)

function parseTenantArg(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--tenant="));
  return arg?.split("=")[1];
}

async function main(): Promise<void> {
  if (!isEmbeddingConfigured()) {
    console.error(
      "No hay proveedor de embeddings configurado (falta GEMINI_API_KEY u OPENAI_API_KEY en .env.local).",
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const tenantId = parseTenantArg();
  if (tenantId) {
    console.log(`Reindexando solo tenant ${tenantId}`);
  }

  const pending = await prisma.$queryRaw<Array<{ id: string; content: string }>>(
    tenantId
      ? Prisma.sql`SELECT id, content FROM "BudgetChunk" WHERE embedding IS NULL AND "tenantId" = ${tenantId}::uuid ORDER BY "createdAt" ASC`
      : Prisma.sql`SELECT id, content FROM "BudgetChunk" WHERE embedding IS NULL ORDER BY "createdAt" ASC`,
  );

  const total = pending.length;
  console.log(`${total} chunk(s) sin embedding por procesar.`);

  let done = 0;
  let failed = 0;
  for (const chunk of pending) {
    try {
      const { embedding } = await embedText(chunk.content);
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "BudgetChunk" SET embedding = ${toPgVectorLiteral(embedding)}::vector WHERE id = ${chunk.id}::uuid`,
      );
      done += 1;
    } catch (err) {
      failed += 1;
      console.warn(`Falló el chunk ${chunk.id}:`, err instanceof Error ? err.message : err);
    }
    console.log(`Procesados ${done + failed}/${total} (ok: ${done}, error: ${failed})`);
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }

  console.log(`Listo. ${done} embeddings generados, ${failed} fallidos.`);
  await prisma.$disconnect();
}

void main();
