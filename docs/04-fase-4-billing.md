# Fase 4 — Perfil, configuración y billing (panel real + webhook Stripe)

> Hito completado el 2026-06-11. Cierra la base codeable de las Fases 1-4: el
> tenant ya puede configurar su rubro/branding, ver su plan y uso, y la
> infraestructura de Subscription queda lista para activar Stripe.

## Perfil de empresa — `/perfil`

- [src/app/api/perfil/route.ts](../src/app/api/perfil/route.ts) — `GET` trae el
  `CompanyProfile` del tenant (o `null`); `PUT` hace upsert validando con Zod
  (colores hex `#RRGGBB`, URL de logo, `companyData` parcial).
- [src/app/(app)/perfil/page.tsx](../src/app/(app)/perfil/page.tsx) — server
  component que parsea `companyData` (Json) con un schema tolerante (`.partial()`)
  y arma el `PerfilData` inicial.
- [src/features/perfil/perfil-form.tsx](../src/features/perfil/perfil-form.tsx) —
  formulario client con tres bloques:
  - **Rubro y estilo**: `industry`, `tone`, `defaultUnits` y el
    `industryPrompt` (el campo que más impacta la calidad de la generación).
  - **Branding para documentos**: `logoUrl`, `colorPrimary`/`colorSecondary`
    con swatch de previsualización — alimentan directo a
    [src/lib/docx/branding.ts](../src/lib/docx/branding.ts) (Fase 3).
  - **Datos de la empresa (membrete)**: razón social, CUIT, dirección,
    teléfono, email, web → `companyData` Json.

## Configuración — `/configuracion`

[src/app/(app)/configuracion/page.tsx](../src/app/(app)/configuracion/page.tsx)
centraliza el estado operativo del tenant en 4 cards:

1. **Plan y uso**: `getTenantPlan()` + `checkGenerationLimit()` +
   `checkHistoricalLimit()` ([src/lib/billing/limits.ts](../src/lib/billing/limits.ts))
   con barras de progreso (`UsageBar`, verde/amarillo/rojo según %), y
   comparación de los 3 planes (`PLANS` en
   [src/lib/billing/plans.ts](../src/lib/billing/plans.ts)) con el actual
   resaltado.
2. **Miembros**: lista desde `Membership` + `User` (espejo de Clerk), con badge
   de rol (`OWNER`/`ADMIN`/`MEMBER`).
3. **Proveedores de IA**: estado de cada proveedor del `PROVIDER_CATALOG`
   (Gemini/Groq/OpenAI/OpenRouter) según `availableProviders()`, más badges de
   embeddings (`isEmbeddingConfigured()`) y storage (`isStorageConfigured()`).
4. **Inflación**: último índice cargado para `country`/`defaultCurrency` del
   tenant + botón
   [InflacionSync](../src/features/configuracion/inflacion-sync.tsx) que
   dispara `/api/inflacion/sync` (Fase 2).

## Dashboard con métricas reales — `/dashboard`

[src/app/(app)/dashboard/page.tsx](../src/app/(app)/dashboard/page.tsx) ya no
muestra placeholders (`—`): calcula en paralelo con `Promise.all`

- **Históricos**: total no archivado + cuántos están `INDEXED` (disponibles
  para RAG).
- **Presupuestos**: total y generados en el mes calendario actual.
- **Uso de IA este mes**: `SUM(totalTokens)` de `UsageRecord` desde el inicio
  del mes.
- **Últimos 5 presupuestos generados**: título, fecha, monto y estado
  (Borrador/Final), con `EmptyState` si todavía no generó ninguno y un aviso
  para cargar históricos si no tiene ninguno activo.

## Webhook de Stripe (stub funcional) — `/api/webhooks/stripe`

[src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts)

- **Sin SDK de Stripe**: la firma se verifica manualmente con
  `crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET)` sobre `"{timestamp}.{payload}"`
  (mismo esquema que `Stripe-Signature: t=...,v1=...`), comparación
  `timingSafeEqual`. Si `STRIPE_WEBHOOK_SECRET` no está configurado, responde
  `503` sin romper nada (degrada igual que el resto de integraciones opcionales).
- **Eventos soportados**:
  - `checkout.session.completed` → guarda `stripeCustomerId` /
    `stripeSubscriptionId` en `Subscription`, vinculados por
    `client_reference_id` o `metadata.tenantId` (el tenant debe pasarse al crear
    la sesión de checkout).
  - `customer.subscription.created` / `.updated` → resuelve el plan
    (`STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` → `SubscriptionPlan`), mapea el
    `status` de Stripe a `SubscriptionStatus` (`trialing`→TRIALING,
    `active`→ACTIVE, `past_due`/`unpaid`/`incomplete`→PAST_DUE, resto→CANCELED)
    y hace upsert de `Subscription` + `AuditLog(SUBSCRIPTION_CHANGED)`.
  - `customer.subscription.deleted` → marca `status = CANCELED`.
- Si llega un evento de suscripción sin `metadata.tenantId`, se resuelve el
  tenant buscando por `stripeCustomerId` ya guardado (requiere que
  `checkout.session.completed` haya corrido antes).

### Variables de entorno nuevas (todas opcionales)

Agregadas a [src/lib/env.ts](../src/lib/env.ts):

```
STRIPE_SECRET_KEY=        # reservado para crear checkout sessions (no usado aún)
STRIPE_WEBHOOK_SECRET=    # requerido para que el webhook acepte eventos
STRIPE_PRICE_STARTER=     # price id de Stripe → plan STARTER
STRIPE_PRICE_PRO=         # price id de Stripe → plan PRO
```

## Pendiente de intervención manual

- Crear los productos/precios en Stripe y completar `STRIPE_*` en `.env.local`.
- Endpoint para crear la **checkout session** (requiere `STRIPE_SECRET_KEY` y
  decidir SDK vs. REST directa) — hoy el upgrade de plan es manual desde
  `/configuracion` (mensaje informativo).
- Configurar el webhook en el dashboard de Stripe apuntando a
  `/api/webhooks/stripe` con los eventos listados arriba.
- Evaluar Mercado Pago para AR (mencionado en CLAUDE.md, no implementado).

## Estado general del proyecto

Con esto, **Fases 0 a 4 están code-complete** según el roadmap de
`CLAUDE.md`. Lo que resta es 100% activación con secrets/credenciales reales
(Clerk, Supabase, proveedores de IA, Stripe) — sin más código pendiente para
el flujo end-to-end descripto en "Flujo de datos end-to-end".
