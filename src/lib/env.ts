import { z } from "zod";

/**
 * Validación de variables de entorno del servidor con Zod.
 * Falla rápido (al primer acceso server-side) si falta algo crítico.
 * Las NEXT_PUBLIC_* de Clerk las lee el SDK directamente del entorno.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),

  // Object storage para PDFs (Supabase Storage del mismo proyecto).
  // Opcional en Fase 0; requerido para subir históricos (Fase 1).
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().default("historicos"),

  // IA (opcional en Fase 0; Gemini requerido para extracción/embeddings/generación)
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),

  // Microservicio externo de extracción de PDF (opcional; fallback local unpdf)
  PDF_EXTRACT_SERVICE_URL: z.string().url().optional(),

  // Billing (Stripe). Opcional hasta Fase 4; el webhook degrada sin esto.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),

  // Google Drive (OAuth por tenant, scope drive.readonly). Opcional.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Cifrado at-rest de secretos (ej. refreshToken de integraciones). 32 bytes
  // en base64; generar con `openssl rand -base64 32`. Ver src/lib/crypto.ts.
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),

  // Notificaciones por email (Resend). Opcional: sin esto, las solicitudes de
  // demo solo quedan en la DB.
  RESEND_API_KEY: z.string().optional(),
  DEMO_NOTIFY_EMAIL: z.string().email().optional(),

  // Cron jobs (Vercel Cron firma el request con este secret en Authorization).
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Variables de entorno inválidas:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
