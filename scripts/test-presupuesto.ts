import dotenv from "dotenv";

// Cargar .env.local ANTES de cualquier import dinámico que dependa de env
// (prisma, providers de IA, etc.). Nunca leer .env* con otra herramienta que
// no sea dotenv en runtime.
dotenv.config({ path: ".env.local" });
dotenv.config();

/**
 * Harness de diagnóstico interno (F.1 / F.4 de docs/tareas.md).
 *
 * Inspirado en el concepto de `pruebas/prueba-presupuesto.ts` de ITZA, pero
 * adaptado a la arquitectura multi-tenant de CotizaAI: todo comando recibe un
 * `--tenant=<uuid>` explícito (no hay sesión Clerk en un script de consola).
 *
 * Uso (ejecutar con tsx para que TS corra directo sin build):
 *   npx tsx scripts/test-presupuesto.ts --help
 *   npx tsx scripts/test-presupuesto.ts overview --tenant=<uuid>
 *   npx tsx scripts/test-presupuesto.ts rag --tenant=<uuid> "<pedido>"
 *   npx tsx scripts/test-presupuesto.ts gen --tenant=<uuid> "<pedido>"
 *
 * O via el script de package.json (mismos argumentos después de `--`):
 *   npm run test:presupuesto -- overview --tenant=<uuid>
 *
 * Nota sobre el alias `@/`: tsx (vía esbuild) NO resuelve por sí solo el path
 * mapping de tsconfig.json. Este script evita el problema importando todo con
 * rutas RELATIVAS a `src/` en lugar de `@/...` — es el workaround más simple
 * y no requiere `tsconfig-paths` ni flags adicionales. Si en el futuro se
 * agregan imports nuevos a este archivo, usar rutas relativas (`../src/...`).
 */

const HELP = `
Diagnóstico interno de CotizaAI — scripts/test-presupuesto.ts

Comandos:
  --help                                   Muestra esta ayuda.

  overview --tenant=<uuid>                 [READ-ONLY]
    Por tenant: conteo de HistoricalBudget por status, último índice de
    inflación cargado, y cuántos BudgetChunk tienen embedding vs no.

  rag --tenant=<uuid> "<pedido>"           [READ-ONLY]
    Llama a buildRagContext() directo y muestra el contextText completo,
    sourceIds y mode (vectorial/lexico/none) resultante.

  gen --tenant=<uuid> "<pedido>"           [GASTA CUOTA REAL DE IA]
    Llama a generateBudgetPayload() (RAG + tool-calling real contra el
    proveedor de IA configurado) y muestra el payload generado formateado.
    ADVERTENCIA: esto consume cuota real de un proveedor (Gemini/Groq/etc.)
    y puede registrar UsageRecord en la base. No usar en loops ni CI.

Ejemplos:
  npx tsx scripts/test-presupuesto.ts overview --tenant=11111111-1111-1111-1111-111111111111
  npx tsx scripts/test-presupuesto.ts rag --tenant=... "Pintura de 3 ambientes en CABA"
  npx tsx scripts/test-presupuesto.ts gen --tenant=... "Pintura de 3 ambientes en CABA"
`;

function parseArgs(argv: string[]): {
  command: string | null;
  tenantId: string | null;
  query: string | null;
  help: boolean;
} {
  const help = argv.includes("--help") || argv.includes("-h") || argv.length === 0;
  const command = argv.find((a) => !a.startsWith("-")) ?? null;
  const tenantArg = argv.find((a) => a.startsWith("--tenant="));
  const tenantId = tenantArg ? tenantArg.slice("--tenant=".length) : null;
  // El pedido es el primer argumento positional que no es el comando.
  const positionals = argv.filter((a) => !a.startsWith("-"));
  const query = positionals.length > 1 ? positionals[positionals.length - 1] : null;
  return { command, tenantId, query, help };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function cmdOverview(tenantId: string): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`No existe ningún Tenant con id ${tenantId}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Overview — ${tenant.name} (${tenant.id}) ===`);
  console.log(`País: ${tenant.country} · Moneda: ${tenant.defaultCurrency}`);

  const statusCounts = await prisma.historicalBudget.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { _all: true },
  });
  console.log("\n-- HistoricalBudget por status --");
  if (statusCounts.length === 0) {
    console.log("  (sin históricos cargados)");
  } else {
    for (const row of statusCounts) {
      console.log(`  ${row.status}: ${row._count._all}`);
    }
  }

  const latestIndex = await prisma.inflationIndex.findFirst({
    where: { country: tenant.country, currency: tenant.defaultCurrency },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  console.log("\n-- Último índice de inflación cargado --");
  console.log(
    latestIndex
      ? `  ${latestIndex.year}-${String(latestIndex.month).padStart(2, "0")} · tasa mensual ${(latestIndex.monthlyRate * 100).toFixed(2)}% · fuente: ${latestIndex.source ?? "?"}`
      : "  (sin índices cargados para este país/moneda)",
  );

  // La columna `embedding vector(768)` no está en el schema Prisma (SQL
  // crudo), así que el conteo embebido vs sin embebido también se hace con
  // SQL crudo — mismo patrón que src/lib/rag/indexing.ts.
  const { Prisma } = await import("@prisma/client");
  const embedRows = await prisma.$queryRaw<
    Array<{ with_embedding: bigint; without_embedding: bigint }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS with_embedding,
      COUNT(*) FILTER (WHERE embedding IS NULL) AS without_embedding
    FROM "BudgetChunk"
    WHERE "tenantId" = ${tenantId}::uuid
  `);
  const embedRow = embedRows[0];
  console.log("\n-- BudgetChunk: embedding vs sin embedding --");
  console.log(
    embedRow
      ? `  con embedding: ${embedRow.with_embedding} · sin embedding: ${embedRow.without_embedding}`
      : "  (sin chunks)",
  );
  console.log("");
}

async function cmdRag(tenantId: string, query: string): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");
  const { buildRagContext } = await import("../src/lib/rag/retrieval");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`No existe ningún Tenant con id ${tenantId}.`);
    process.exitCode = 1;
    return;
  }

  const result = await buildRagContext({
    tenantId,
    query,
    country: tenant.country,
    currency: tenant.defaultCurrency,
  });

  console.log(`\n=== RAG — pedido: "${query}" ===`);
  console.log(`Modo: ${result.mode}`);
  console.log(`sourceIds (${result.sourceIds.length}): ${JSON.stringify(result.sourceIds, null, 2)}`);
  console.log("\n-- contextText completo --\n");
  console.log(result.contextText || "(vacío — sin históricos relevantes)");
  console.log("");
}

async function cmdGen(tenantId: string, query: string): Promise<void> {
  console.warn(
    "\n⚠️  ADVERTENCIA: este comando llama a un proveedor de IA real y " +
      "consume cuota (y puede registrar UsageRecord en la base). " +
      "Presioná Ctrl+C en los próximos 3s para cancelar...\n",
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const { prisma } = await import("../src/lib/prisma");
  const { generateBudgetPayload } = await import("../src/lib/ai/generation");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`No existe ningún Tenant con id ${tenantId}.`);
    process.exitCode = 1;
    return;
  }
  const profile = await prisma.companyProfile.findUnique({
    where: { tenantId },
  });

  const outcome = await generateBudgetPayload({
    tenant,
    profile,
    requestPrompt: query,
  });

  console.log(`\n=== Generación — pedido: "${query}" ===`);
  console.log(`Proveedor: ${outcome.provider} · Modelo: ${outcome.model}`);
  console.log(`Uso de tokens: ${JSON.stringify(outcome.usage)}`);
  console.log(`RAG mode: ${outcome.rag.mode} · sourceIds: ${JSON.stringify(outcome.rag.sourceIds)}`);
  console.log("\n-- Payload generado --\n");
  console.log(JSON.stringify(outcome.payload, null, 2));
  console.log("");
}

async function main(): Promise<void> {
  const { command, tenantId, query, help } = parseArgs(process.argv.slice(2));

  if (help || !command) {
    console.log(HELP);
    return;
  }

  if (command !== "overview" && command !== "rag" && command !== "gen") {
    console.error(`Comando desconocido: "${command}".\n`);
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  if (!tenantId || !UUID_RE.test(tenantId)) {
    console.error(
      `Falta o es inválido --tenant=<uuid>. Ejemplo: --tenant=11111111-1111-1111-1111-111111111111\n`,
    );
    process.exitCode = 1;
    return;
  }

  if ((command === "rag" || command === "gen") && !query) {
    console.error(`El comando "${command}" requiere un pedido entre comillas. Ejemplo:\n  ${command} --tenant=${tenantId} "Pintura de 3 ambientes en CABA"\n`);
    process.exitCode = 1;
    return;
  }

  try {
    if (command === "overview") {
      await cmdOverview(tenantId);
    } else if (command === "rag") {
      await cmdRag(tenantId, query as string);
    } else if (command === "gen") {
      await cmdGen(tenantId, query as string);
    }
  } finally {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exitCode = 1;
});
