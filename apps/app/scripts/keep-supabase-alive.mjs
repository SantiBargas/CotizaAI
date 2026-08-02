import { config } from "dotenv";
import { Client } from "pg";

/**
 * Ping mínimo a la base para que Supabase free tier no la pause por
 * inactividad (se pausa tras ~1 semana sin actividad). Un SELECT trivial
 * alcanza; no toca ninguna tabla de negocio.
 */
config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!connectionString) {
  console.error("Falta DATABASE_URL o DIRECT_URL en .env.local");
  process.exit(1);
}

const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query("SELECT 1");
  console.log(`[keep-alive] OK — ${new Date().toISOString()}`);
} catch (err) {
  console.error("[keep-alive] Falló:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
