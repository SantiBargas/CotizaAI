# Fase 2 — Motor RAG + generación con IA

> Hito completado el 2026-06-10. Pedido en lenguaje natural → RAG sobre los
> históricos del tenant (ajustados por inflación) → presupuesto en bloques
> tipados vía tool-calling → editor de bloques.

## Flujo de generación

```
POST /api/generar { prompt }
  1. Límite por plan (checkGenerationLimit)        src/lib/billing/limits.ts
  2. RAG: buildRagContext()                        src/lib/rag/retrieval.ts
     vectorial (pgvector) → fallback léxico → sin contexto (nunca rompe)
  3. Prompt maestro: industryPrompt + tono + reglas + históricos con monto
     ACTUALIZADO POR INFLACIÓN                     src/lib/ai/generation.ts
  4. callWithTool("emitir_presupuesto") — tool-calling FORZADO
  5. Normalización defensiva + validación Zod
  6. GeneratedBudget (DRAFT) + ragSourceIds (trazabilidad)
  7. UsageRecord (GENERATION) + AuditLog (BUDGET_GENERATED)
→ Editor de bloques en /presupuestos/[id]
```

## Retrieval RAG — [src/lib/rag/retrieval.ts](../src/lib/rag/retrieval.ts)

Mejoras sobre ITZA aplicadas desde el día 1:

| ITZA | CotizaAI |
|---|---|
| Vectorial opt-in | **Vectorial default**, léxico como fallback |
| Scoring léxico O(N×M) en JS sobre todo el pool | pgvector ordena por distancia coseno **en Postgres** |
| Sin trazabilidad | `ragSourceIds` guardado en cada generación |
| Monto ajustado solo ARS hardcodeado | Inflación **pluggable por país/moneda** |

- **Vectorial**: `embedding <=> query::vector` con JOIN a `HistoricalBudget`
  (solo `INDEXED`), **siempre `WHERE tenantId = ...`** (aislamiento entre
  empresas). Top 12 chunks → agrupados por histórico → top 3 al prompt.
- **Léxico**: normalización (minúsculas + sin tildes NFD) + tokenización con
  stopwords ES + pesos por longitud de token (≥10→4, ≥7→3, ≥5→2). Pool máximo
  300 chunks recientes.
- **Inflación en el contexto**: cada histórico entra al prompt con
  `Monto original → ACTUALIZADO POR INFLACIÓN A HOY: $X. USAR ESTE VALOR...`
  (la instrucción explícita es la que funciona, aprendizaje de ITZA).
- Degradación total: si la DB falla, la generación sigue sin RAG.

## Inflación — [src/lib/inflation.ts](../src/lib/inflation.ts)

- Fórmula: `monto × ∏(1 + tasaMensual)` desde el mes siguiente al documento
  hasta el mes anterior al actual. **Nunca se persiste** (derivado runtime).
- `computeInflationFactor()` es **función pura** (índices precargados → sin N
  queries). Reporta `monthsApplied` e `incomplete` (faltan índices).
- Pluggable: `InflationIndex` lleva `country`/`currency`. El primer adaptador
  es **INDEC** (`syncIndecIndices()`: serie IPC Nacional de
  `apis.datos.gob.ar`, sin auth, upsert idempotente).
- API: `GET /api/inflacion` (índices) · `POST /api/inflacion/sync` (sync INDEC).

## Generación — [src/lib/ai/generation.ts](../src/lib/ai/generation.ts)

- Tool `emitir_presupuesto` con schema JSON **plano** (sin discriminated
  unions → compatible con Gemini y OpenAI-compat a la vez): bloques
  `{ type, texto?, items?, encabezados?, filas? }`.
- **Normalización defensiva** heredada del aprendizaje de ITZA: repara
  `tipo→type`, `text/content/body→texto`, montos en formato argentino
  ("1.234,56"), bloques desconocidos degradan a párrafo, filas vacías se
  descartan. Validación final con Zod (`generatedBudgetPayloadSchema`).
- Prompt maestro inyecta: nombre de empresa, rubro, `industryPrompt`
  (el "ADN" del tenant), tono, unidades, reglas (sin firmas, sin datos
  bancarios inventados, tablas para ítems) y el contexto RAG.

## API

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/generar` | POST | Genera y guarda DRAFT (límite por plan → 429) |
| `/api/presupuestos/[id]` | GET / PATCH / DELETE | Detalle · ediciones del editor · borrado |
| `/api/inflacion` | GET | Índices por país/moneda |
| `/api/inflacion/sync` | POST | Sync IPC INDEC |

## UI

- **/generar** ([generar-form.tsx](../src/features/presupuestos/generar-form.tsx)):
  textarea del pedido → genera → redirige al editor. Muestra el modo RAG usado.
- **/presupuestos** : lista con total, estado (DRAFT/FINAL), fecha.
- **/presupuestos/[id]** ([budget-editor.tsx](../src/features/presupuestos/budget-editor.tsx)):
  **editor de bloques** completo — editar datos generales (título, total,
  moneda, forma de pago, validez), editar/mover/eliminar/agregar bloques
  (título, subtítulo, párrafo, lista, tabla con editor de celdas), guardar,
  marcar FINAL, botones de export Word/PDF (Fase 3).

## Límites por plan (adelanto de Fase 4)

[src/lib/billing/plans.ts](../src/lib/billing/plans.ts) +
[limits.ts](../src/lib/billing/limits.ts): FREE (10 gen/mes, 20 históricos),
STARTER (100/200), PRO (1000/2000). Sin `Subscription` activa → FREE.
Aplicados en `/api/generar` y `/api/historicos/upload` (HTTP 429).
