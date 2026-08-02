# CLAUDE.md — CotizaAI

Guía para Claude Code al trabajar en este repositorio.

> **Docs hermanos:** [`REFERENCIA-ITZA.md`](REFERENCIA-ITZA.md) (radiografía del
> proyecto de referencia y qué replicar/mejorar) · [`DESIGN.md`](DESIGN.md)
> (sistema de diseño y branding). Mantener los tres actualizados.

## Qué es CotizaAI

SaaS multi-tenant que genera **presupuestos/cotizaciones profesionales con IA**
para empresas de cualquier rubro. Cada empresa (tenant) sube sus presupuestos
históricos en PDF, configura su perfil de rubro, y la IA aprende de ese histórico
para generar presupuestos nuevos, ajustados por inflación y listos para enviar.

**Tesis:** lo único que cambia entre empresas es (a) su perfil de rubro
(`CompanyProfile.industryPrompt`) y (b) sus PDFs históricos. El motor es el mismo.

Es un producto **comercial** (suscripción self-serve). La UI tiene que verse
profesional desde el día 1.

## Monorepo

Turborepo + npm workspaces, dos apps Next.js independientes + un paquete de
UI compartido:

- **`apps/web`** — landing pública de marketing. Cero Clerk, cero Prisma, cero
  backend: solo vende el producto y empuja a "Solicitar demo" o "Iniciar
  sesión" (ambos cross-origin hacia `apps/app` vía `NEXT_PUBLIC_APP_URL`).
- **`apps/app`** — el SaaS autenticado: `(app)`, `(auth)`, `/ingresar`, todo
  `api/*` (incluye `/api/demo`, con CORS acotado a `MARKETING_ORIGIN` porque
  `apps/web` le pega cross-origin), `lib/`, `prisma/`.
- **`packages/ui`** (`@cotizaai/ui`) — design system compartido (`Button`,
  `Card`, `Modal`, etc.) + `DemoRequest`/`ParticleField` (los usan ambas
  apps) + `theme.css` con los tokens de marca. Sin build step: cada app lo
  transpila vía `transpilePackages` en su `next.config.ts`.

Pensado así para escalar a equipo/deploys independientes sin reescritura: hoy
las dos apps corren en un solo dominio (o en `localhost:3000`/`3001`), pero
mover `apps/web` a un dominio de marketing separado y `apps/app` a
`app.<dominio>` el día que haga falta es solo config de DNS + Vercel + las
env vars `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_MARKETING_URL`/`MARKETING_ORIGIN`,
no un refactor de código.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript estricto** (sin `any`).
- **Prisma** + **PostgreSQL (Supabase)** con **pgvector** para embeddings.
- **Clerk** para auth + multi-tenancy (Organizations = tenants).
- **Tailwind CSS** + sistema de diseño propio (ver `DESIGN.md`).
- **IA:** multi-proveedor (Gemini primario para MVP + embeddings; OpenAI/Groq/
  OpenRouter como alternativas con fallback).
- **Documentos:** `docx` (Word) + PDF.
- **Billing:** Stripe (internacional); evaluar Mercado Pago para AR.
- Deploy en **Vercel**; microservicio aparte para extracción de PDF si hace falta.

## Decisiones tomadas

- **Auth = Clerk** (gratis hasta ~10k MAU, trae orgs/invitaciones/roles/social
  login). Mantenemos espejo `Tenant`/`User`/`Membership` en nuestra DB vía
  webhooks de Clerk para FKs e info de negocio.
- **IA primaria = Gemini** (free tier + embeddings `gemini-embedding-001` 768D).
- **Vectorial es el modo RAG default** (no opt-in como en ITZA), con prefiltro en
  Postgres y fallback léxico.
- **Tool/Function Calling** para la generación (no parsing frágil de JSON).

## Arquitectura multi-tenant (regla de oro)

**Todo acceso a datos pasa por `tenantId`, derivado SIEMPRE de la sesión Clerk,
NUNCA del body del cliente.** Helper central en `apps/app/src/lib/tenant.ts`
que resuelve el tenant desde `auth()` y expone queries scopeadas. La búsqueda
vectorial filtra por `tenantId` para aislar embeddings entre empresas. Ningún
dato cruza tenants.

Roles por tenant (`Membership.role`): `OWNER` | `ADMIN` | `MEMBER`.

## Estructura de carpetas (objetivo)

```
apps/
  app/                       # SaaS autenticado (app.<dominio> el día de mañana)
    src/
      app/
        (auth)/                # sign-in (Clerk)
        (app)/                 # dashboard autenticado (scopeado a tenant)
          dashboard/
          historicos/          # carga e indexado de PDFs
          generar/             # generador de presupuestos
          perfil/               # CompanyProfile + branding
          configuracion/        # AI config, miembros, billing
        ingresar/              # login gateway (marketing pitch + <SignIn/>)
        api/
          webhooks/clerk/       # sync Clerk → Tenant/User/Membership
          webhooks/stripe/      # sync billing
          historicos/           # CRUD + upload + extract + reindex
          generar/               # endpoint de generación IA (tool-calling)
          inflacion/              # índices + sync INDEC
          demo/                   # solicitud de demo (público, CORS desde apps/web)
        page.tsx                 # raíz: redirect a /dashboard o /ingresar
        middleware.ts             # gate de Clerk (auth.protect en rutas no públicas)
      features/                   # módulos por feature (lógica de pantalla)
      lib/
        prisma.ts                 # cliente Prisma singleton
        tenant.ts                 # resolución y scoping por tenant
        ai/                       # providers.ts, generation.ts, embeddings.ts
        rag/                      # retrieval léxico + vectorial, scoring
        inflation.ts               # factor IPC acumulado (pluggable país/moneda)
        pdf/                       # pipeline de extracción
        docx/                      # generación de documentos Word/PDF
    prisma/
      schema.prisma               # modelos (ver archivo)
      migrations/                 # incluye SQL crudo para columna vector(768)
  web/                       # landing de marketing (sin Clerk/Prisma)
    src/
      app/page.tsx            # one-page, empuja a "Solicitar demo"/"Iniciar sesión"
      features/landing/       # MarketingNav, ProductMockup (solo esta app)
packages/
  ui/                          # @cotizaai/ui — design system compartido
    src/
      button.tsx, card.tsx, modal.tsx, ...  # primitivos
      demo-request.tsx, particle-field.tsx  # compartidos por ambas apps
      theme.css                             # tokens de marca (@theme inline)
services/
  pdf-extract/              # (opcional) microservicio de extracción
```

## Flujo de datos end-to-end

1. **Onboarding:** usuario se registra (Clerk) → crea organización → webhook
   `clerk` crea `Tenant` + `User` + `Membership(OWNER)` en nuestra DB.
2. **Configura perfil:** completa `CompanyProfile` (rubro, tono, branding).
3. **Carga históricos:** sube PDFs → object storage → pipeline de extracción
   (estructurado + fallback) → revisión humana → `HistoricalBudget` (status
   `INDEXED`) → se generan `BudgetChunk` con embeddings (pgvector, raw SQL).
4. **Genera presupuesto:** pedido en lenguaje natural → `apps/app/src/lib/rag` recupera los
   históricos más relevantes del tenant (vectorial + léxico fallback) → ajusta por
   inflación → arma prompt con `industryPrompt` + RAG → LLM con tool-calling →
   `GeneratedBudget` (bloques tipados) → registra `UsageRecord` (tokens).
5. **Exporta:** bloques → `docx`/PDF con el branding del `CompanyProfile`.

## Convenciones de código

- **TypeScript estricto, sin `any`.** Tipar el retorno de todas las funciones.
- Archivos en `kebab-case`; componentes React en `PascalCase`; funciones/variables
  en `camelCase`.
- **Cliente Prisma singleton** (`apps/app/src/lib/prisma.ts`) — nunca
  `new PrismaClient()` disperso. Nunca importar Prisma en middleware (rompe
  Edge) ni en `apps/web` (esa app no tiene acceso a la DB).
- **La columna `embedding vector(768)`** se gestiona con SQL crudo, NO en
  `schema.prisma`.
- **Nunca commitear secrets ni `.env`.** Si hace falta un valor, pedírselo al
  usuario. Nunca leer `.env*`.
- Validación de env con **Zod** (`apps/app/src/lib/env.ts`).
- **`packages/ui`** no importa nada de `apps/app/src/lib` (Prisma, tenant,
  Clerk) — tiene que poder usarse desde `apps/web` sin backend. Si un
  componente necesita ese tipo de lógica, no va en `packages/ui`.
- `AuditLog` en operaciones sensibles (upload, generación, cambios de billing).
- Toda query de negocio filtra por `tenantId`.

## Roadmap por fases

- **Fase 0 — Cimientos:** scaffold Next.js + TS + Tailwind + Prisma + Clerk;
  schema base + migración (incluye pgvector); auth multi-tenant + webhooks;
  `DESIGN.md` y design system base. ← *en curso*
- **Fase 1 — Históricos:** upload de PDFs, pipeline de extracción con fallback,
  indexado (chunks + embeddings), pantalla de revisión.
- **Fase 2 — Motor RAG + generación:** retrieval léxico+vectorial scopeado por
  tenant, ajuste por inflación, generación con tool-calling, editor de bloques.
- **Fase 3 — Export documentos:** Word/PDF con branding por tenant.
- **Fase 4 — Billing + onboarding pulido:** Stripe (+ Mercado Pago AR), planes,
  límites por uso, onboarding self-serve completo.
- **Fase 5 — Mejoras (completada):** modo oscuro (cookie + toggle), énfasis
  paleta Miami Dolphins, onboarding guiado en dashboard, checkout de Stripe
  (`/api/billing/checkout`), integración Google Drive (OAuth por tenant +
  import de PDFs al pipeline de históricos). Ver `docs/05-fase-5-mejoras.md`.
- **Backlog / pendientes:**
  - **Migrar Supabase a `sa-east-1` (São Paulo):** el proyecto actual está en
    `us-west-2` (Oregón) y suma ~150-300ms por query desde Argentina. La región
    no se cambia in-place: crear proyecto nuevo en São Paulo, actualizar
    `DATABASE_URL`/`DIRECT_URL` en `.env.local` (lo hace el usuario), correr
    `npm run prisma:migrate` (aplica las 3 migraciones, pgvector incluido) y
    dejar que el sync lazy regenere Tenant/User/Membership. Después pausar o
    borrar el proyecto de Oregón.
  - Mercado Pago para AR (evaluación).
  - Cifrado at-rest del `refreshToken` de Google Drive.
  - Customer portal de Stripe (cambios/cancelación de plan self-serve).

## Comandos

Todos corren desde la **raíz del monorepo** (Turborepo orquesta las dos apps):

```
npm run dev              # apps/app en :3000 + apps/web en :3001 (Turbopack)
npm run build            # build de producción de ambas apps
npm run lint              # ESLint en ambas apps
npm run prisma:generate  # regenerar cliente Prisma (pasa a apps/app)
npm run prisma:migrate   # migraciones (dev, pasa a apps/app)
npm run prisma:push      # push de schema sin migración (pasa a apps/app)
npm run prisma:studio    # explorar la DB (pasa a apps/app)
```

Para correr una sola app: `npm run dev -w apps/app` (o `-w apps/web`).

## Setup local (Fase 0)

1. `cp apps/app/.env.example apps/app/.env.local` y completar Clerk + Supabase
   (pedir valores al usuario; nunca commitear `.env.local`). `apps/web` no
   necesita secretos server-side, solo `NEXT_PUBLIC_APP_URL` (ej.
   `http://localhost:3000` en dev) en su propio `.env.local`.
2. `npm install` **desde la raíz del monorepo** (un solo lockfile para todo
   el workspace; corre `prisma generate` en `apps/app` vía postinstall).
3. `npm run prisma:migrate` para crear las tablas en Supabase (incluye la
   migración cruda de pgvector: extensión + columna `embedding` + índice).
4. En Clerk: activar **Organizations**, crear un **webhook** apuntando a
   `/api/webhooks/clerk` (eventos `user.*`, `organization.*`,
   `organizationMembership.*`) y copiar el signing secret a
   `CLERK_WEBHOOK_SIGNING_SECRET`.
5. `npm run dev` (o `npm run dev -w apps/app` si solo hace falta el SaaS).

> Prisma 7: las URLs de conexión viven en `prisma.config.ts` (no en el schema).
> El runtime usa `DATABASE_URL` (pooler) vía driver adapter; el CLI de migraciones
> usa `DIRECT_URL`.
