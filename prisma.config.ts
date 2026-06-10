import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma CLI no autocarga .env con prisma.config.ts: lo hacemos manualmente.
dotenv.config({ path: ".env.local" });
dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // El CLI (migrate/studio) usa la conexión DIRECTA (no el pooler).
    // El runtime usa DATABASE_URL vía el driver adapter en src/lib/prisma.ts.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
