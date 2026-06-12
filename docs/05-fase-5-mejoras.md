# Fase 5 — Mejoras: modo oscuro, branding, onboarding, checkout y Google Drive

> Hito completado el 2026-06-11. Cierra el backlog priorizado: dark mode,
> énfasis Miami Dolphins, onboarding guiado, checkout de Stripe e integración
> con Google Drive para importar históricos.

## Modo oscuro

- Los tokens dark ya existían en [globals.css](../src/app/globals.css)
  (`[data-theme="dark"]`); ahora se activan de verdad.
- **Persistencia por cookie** (`theme=light|dark`, 1 año): el
  [root layout](../src/app/layout.tsx) la lee server-side y renderiza
  `data-theme` en el HTML inicial → **sin flash** de tema incorrecto.
- [ThemeToggle](../src/components/ui/theme-toggle.tsx) (sol/luna) en el header
  del área autenticada. SSR y primer render comparten la cookie, así que no hay
  mismatch de hidratación.
- Se agregó `--brand-blue: #4da3c7` al tema dark (el azul light era ilegible
  sobre fondo oscuro; lo usa el logo "Cotiza").

## Énfasis paleta Miami Dolphins

- **Regla de marca** (gradiente aqua → azul → naranja) arriba del header del
  área app y de la landing.
- **Nav con estado activo**: [AppNav](../src/features/nav/app-nav.tsx) (client,
  `usePathname`) resalta la sección actual con aqua (`bg-primary/10`).
- **Dashboard**: cada métrica con borde superior de marca (aqua/azul/naranja).
- La barra de progreso del onboarding usa gradiente aqua→azul.

## Onboarding guiado

[PrimerosPasos](../src/features/onboarding/primeros-pasos.tsx) en el dashboard:
checklist con estado real derivado de la DB —

1. Completar perfil (existe `industry` o `industryPrompt`).
2. Cargar primer histórico (`historicalBudget` > 0).
3. Indexarlo (alguno en `INDEXED`).
4. Generar primer presupuesto (`generatedBudget` > 0).

Cada paso linkea a su pantalla; la card desaparece cuando está todo completo.

## Checkout de Stripe

- [POST /api/billing/checkout](../src/app/api/billing/checkout/route.ts) crea
  la Checkout Session vía **REST directa** (sin SDK). Body: `{ plan: "STARTER" | "PRO" }`.
- El tenant viaja en `client_reference_id`, `metadata.tenantId` **y**
  `subscription_data.metadata.tenantId` — exactamente lo que el webhook de
  Stripe (Fase 4) usa para vincular la `Subscription` local.
- Reutiliza `stripeCustomerId` si ya existe (evita customers duplicados).
- Degrada con `503` si faltan `STRIPE_SECRET_KEY` o el price id del plan.
- UI: [UpgradePlanButton](../src/features/configuracion/upgrade-plan.tsx) en la
  comparación de planes de `/configuracion` ("Plan actual" / "Mejorar a X").
- Success/cancel vuelven a `/configuracion?checkout=success|cancel`.

## Google Drive (importar históricos)

### Modelo y migraciones

- Nuevo modelo `TenantIntegration` (`@@unique([tenantId, provider])`) con el
  `refreshToken` OAuth y el email de la cuenta. Enum `IntegrationProvider`
  (`GOOGLE_DRIVE`) y acciones de auditoría `INTEGRATION_(CONNECTED|DISCONNECTED)`.
- Migraciones aplicadas: `20260611202949_tenant_integration` y
  `20260611190000_pgvector` (el SQL crudo de pgvector ahora vive como migración
  marcada `--applied`, eliminando el drift y el paso manual del setup).

### Librería — [src/lib/integrations/google-drive.ts](../src/lib/integrations/google-drive.ts)

REST puro (sin SDK de Google): `buildAuthUrl` (scope `drive.readonly` + email,
`access_type=offline`, `prompt=consent`), `exchangeCode`, `getAccessToken`
(refresh por operación, nunca se persiste el access token; si Google devuelve
`invalid_grant` se limpia la conexión rota), `listPdfs` (25 por página, más
recientes primero, búsqueda por nombre), `downloadFile`, `disconnectDrive`
(revoca en Google best-effort + borra la fila).

### Rutas

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/integrations/google/connect` | GET | Inicia OAuth (state anti-CSRF en cookie httpOnly) |
| `/api/integrations/google/callback` | GET | Valida state, canjea code, upsert de la conexión |
| `/api/integrations/google` | GET / DELETE | Estado de conexión / desconectar |
| `/api/integrations/google/files` | GET | Lista PDFs del Drive (`q`, `pageToken`) |
| `/api/historicos/import-drive` | POST | Descarga el PDF y lo ingesta |

El tenant **nunca viaja en el state** del OAuth: se re-deriva de la sesión
Clerk en el callback (regla de oro multi-tenant).

### Pipeline compartido

El cuerpo del upload se extrajo a
[src/lib/pdf/ingest.ts](../src/lib/pdf/ingest.ts) (`ingestPdfHistorical`):
storage → extracción de texto → semántica LLM → `HistoricalBudget` en
`PENDING_REVIEW` + auditoría (con `source: "upload" | "google-drive"`). Lo usan
el upload manual y el import de Drive — mismos límites de plan y de 15 MB.

### UI

- [DriveImport](../src/features/historicos/drive-import.tsx) en `/historicos`:
  si Drive no está conectado, botón "Conectar Google Drive"; conectado, modal
  con búsqueda, paginado ("Cargar más"), importar por archivo y desconectar.
- Banner de resultado del OAuth (`?drive=connected|denied|error|state-error`)
  renderizado server-side en la página.
- Badge de estado en `/configuracion` (sin configurar / sin conectar / email).

### Variables de entorno nuevas (opcionales)

```
GOOGLE_CLIENT_ID=        # OAuth client (tipo Web) en Google Cloud Console
GOOGLE_CLIENT_SECRET=
```

Redirect URI a autorizar en Google Cloud:
`{origin}/api/integrations/google/callback` (ej:
`http://localhost:3000/api/integrations/google/callback`).

## Pendiente de intervención manual

- **Google Cloud**: crear proyecto + OAuth consent screen + credenciales Web
  con el redirect URI de arriba; habilitar la **Google Drive API**; completar
  `GOOGLE_CLIENT_ID/SECRET` en `.env.local`.
- **Stripe**: productos/precios + `STRIPE_*` (ya documentado en
  [docs/04](04-fase-4-billing.md)).
- Nota de seguridad: el `refreshToken` se guarda en texto plano en la DB
  (acceso ya restringido por Supabase). Si se quiere cifrado at-rest a nivel
  aplicación, agregar una clave simétrica por env y cifrar antes de persistir.
