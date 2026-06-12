# Fase 0 — Cimientos

> Hito completado el 2026-06-09. Validado con `tsc --noEmit`, `eslint` y
> `prisma validate` en verde.

## Qué se construyó

Scaffold completo del SaaS multi-tenant: Next.js 16 (App Router) + React 19 +
TypeScript estricto + Tailwind CSS v4 + Prisma 7 + Clerk.

### Auth y multi-tenancy (Clerk)

- **Clerk Organizations = tenants.** Cada organización de Clerk es una empresa.
- [src/middleware.ts](../src/middleware.ts): `clerkMiddleware` protege todo salvo
  rutas públicas (`/`, `/sign-in`, `/sign-up`, `/api/webhooks`).
- [src/app/api/webhooks/clerk/route.ts](../src/app/api/webhooks/clerk/route.ts):
  sincroniza `user.*`, `organization.*` y `organizationMembership.*` hacia el
  espejo local `User`/`Tenant`/`Membership` (vía `verifyWebhook`).
- [src/lib/tenant.ts](../src/lib/tenant.ts): **regla de oro** — `tenantId`
  siempre derivado de la sesión (`auth().orgId`), nunca del body del cliente.
  `getCurrentTenant()` / `requireTenant()`.

### Base de datos (Prisma 7 + Supabase + pgvector)

- [prisma/schema.prisma](../prisma/schema.prisma): modelos `Tenant`, `User`,
  `Membership`, `CompanyProfile`, `TenantAiConfig`, `HistoricalBudget`,
  `BudgetChunk`, `GeneratedBudget`, `InflationIndex`, `UsageRecord`,
  `Subscription`, `AuditLog`. Toda tabla de negocio lleva `tenantId` + índice.
- [prisma/sql/pgvector.sql](../prisma/sql/pgvector.sql): SQL one-shot para
  Supabase (extensión `vector`, columna `embedding vector(768)` en
  `BudgetChunk`, índice ivfflat). **No** va en el schema (Prisma no soporta el
  tipo `vector`).
- [prisma.config.ts](../prisma.config.ts): Prisma 7 saca las URLs del schema.
  El CLI usa `DIRECT_URL`; el runtime usa `DATABASE_URL` (pooler) vía
  `@prisma/adapter-pg` en [src/lib/prisma.ts](../src/lib/prisma.ts) (singleton).

### Design system base

- [DESIGN.md](../DESIGN.md): paleta Miami Dolphins 2013–2017 (aqua `#008E97`,
  azul `#005778`, naranja `#F58220`), tipografía Inter, especificaciones de
  componentes y reglas de UX.
- [src/app/globals.css](../src/app/globals.css): tokens como CSS custom
  properties (light + dark vía `data-theme="dark"`) expuestos a Tailwind v4 con
  `@theme inline` (`bg-bg`, `text-text`, `bg-primary`, etc.).

### Pantallas

- Landing pública ([src/app/page.tsx](../src/app/page.tsx)) con CTA según
  sesión (`<Show when="signed-in|signed-out">` de Clerk v7).
- Sign-in / sign-up con componentes de Clerk.
- Shell autenticado ([src/app/(app)/layout.tsx](../src/app/(app)/layout.tsx))
  con `OrganizationSwitcher` + `UserButton`.
- Dashboard placeholder con cards de métricas.

### Entorno

- [src/lib/env.ts](../src/lib/env.ts): validación de env con Zod, fail-fast.
- `.env.example` documenta todas las variables. `.env.local` queda para que el
  usuario complete (Claude **nunca** lee `.env*`).

## Decisiones tomadas en esta fase

| Decisión | Elección | Por qué |
|---|---|---|
| Auth | Clerk | Gratis hasta ~10k MAU, organizaciones/roles/invitaciones nativas |
| IA primaria | Gemini | Free tier + embeddings `gemini-embedding-001` 768D |
| RAG | Vectorial **default** + fallback léxico | Mejora sobre ITZA (allí era opt-in) |
| Generación | Tool/Function Calling | Elimina parsing frágil de JSON |
| Versiones | Siempre estables | Regla del proyecto: nunca beta/RC/canary |

## Pendiente para activar (requiere intervención del usuario)

1. Crear proyecto Supabase → `DATABASE_URL` + `DIRECT_URL` en `.env.local`.
2. Crear app Clerk (Organizations ON, webhook a `/api/webhooks/clerk`) →
   claves en `.env.local`.
3. `npm run prisma:migrate` + ejecutar `prisma/sql/pgvector.sql` en Supabase.
4. (Fase 2) `GEMINI_API_KEY`.
