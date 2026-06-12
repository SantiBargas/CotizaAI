# Fase 1 — Históricos (upload, extracción, indexado, revisión)

> Hito completado el 2026-06-10. El tenant sube sus presupuestos históricos en
> PDF, la IA extrae los datos, el humano revisa y el contenido queda indexado
> (chunks + embeddings) para alimentar el RAG de la Fase 2.

## Flujo end-to-end

```
PDF → /api/historicos/upload
  1. Storage (Supabase Storage, opcional)        src/lib/storage.ts
  2. Extracción de texto (dual con fallback)     src/lib/pdf/extract.ts
  3. Cajitas semánticas + metadata (LLM rápido)  extractSemanticContent()
  4. HistoricalBudget en PENDING_REVIEW
→ Revisión humana en /historicos/[id]
→ "Aprobar e indexar" → /api/historicos/[id]/index
  5. Chunks (src/lib/rag/chunking.ts)
  6. Embeddings 768D + UPDATE vector vía SQL     src/lib/rag/indexing.ts
  7. Status INDEXED → entra al pool del RAG
```

## Módulos nuevos

### Storage — [src/lib/storage.ts](../src/lib/storage.ts)
- Supabase Storage vía REST (sin SDK). Bucket privado (`STORAGE_BUCKET`,
  default `historicos`); cada archivo va a `tenants/{tenantId}/...`.
- Descargas con **URLs firmadas** (10 min). Borrado al eliminar el histórico.
- **Opcional**: si no hay `SUPABASE_URL`/`SUPabase_SERVICE_ROLE_KEY`, el upload
  sigue funcionando (no guarda el original, pero sí el texto extraído).

### Extracción de PDF — [src/lib/pdf/extract.ts](../src/lib/pdf/extract.ts)
- **Dual con fallback** (patrón ITZA): si hay `PDF_EXTRACT_SERVICE_URL`
  (microservicio tipo MarkItDown) se intenta primero; si falla o no existe,
  fallback local con **unpdf** (sin deps nativas, corre en Vercel).
- **Extracción semántica**: LLM rápido con **tool-calling forzado** extrae
  metadata (título, cliente, monto, moneda, fecha) + "cajitas":
  `resumen`, `tareasDetalladas`, `productosEquipos`, `entregables`,
  `condicionesComerciales`. Normalización defensiva (montos formato argentino,
  arrays sucios) y validación final con Zod ([src/types/budget.ts](../src/types/budget.ts)).
- Si no hay API key de IA, el histórico queda con texto crudo y el usuario
  completa a mano: **nada se rompe sin IA**.

### IA multi-proveedor — [src/lib/ai/providers.ts](../src/lib/ai/providers.ts)
- Catálogo: **Gemini (primario)**, Groq, OpenAI, OpenRouter — todo vía fetch.
- `chatCompletion()` (texto) y `callWithTool()` (tool/function-calling
  **forzado**: el LLM siempre responde invocando el tool → sin parsing frágil).
- Fallback automático al primer proveedor con API key configurada.
- JSON Schema de los tools escrito a mano (subset compatible Gemini + OpenAI).

### Embeddings — [src/lib/ai/embeddings.ts](../src/lib/ai/embeddings.ts)
- 768D fijos: Gemini `gemini-embedding-001` (`outputDimensionality: 768`) u
  OpenAI `text-embedding-3-small` (`dimensions: 768`) — misma columna sirve
  para ambos. `EMBEDDING_PROVIDER` elige (default `gemini`).
- `toPgVectorLiteral()` serializa al literal `'[...]'::vector`.

### Chunking — [src/lib/rag/chunking.ts](../src/lib/rag/chunking.ts)
- Si hay extracción semántica: **cada cajita = un chunk** (denso y corto).
- Sin extracción: texto crudo troceado por párrafos (~1200 chars, overlap 150).
- Todo chunk lleva header con título/cliente/ubicación para que el embedding
  capture contexto.

### Indexado — [src/lib/rag/indexing.ts](../src/lib/rag/indexing.ts)
- `reindexHistoricalBudget(tenantId, budgetId)`: regenera chunks (idempotente)
  y calcula embeddings. `UPDATE "BudgetChunk" SET embedding = ...::vector`
  con `$executeRaw` **siempre filtrando por tenantId**.
- Si un embedding falla, el chunk queda sin vector (lo cubre el fallback
  léxico). Registra `UsageRecord` (operación `EMBEDDING`, tokens estimados).

## API (todas scopeadas por tenant vía `requireTenantContext()`)

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/historicos` | GET / POST | Lista · alta manual |
| `/api/historicos/upload` | POST | Pipeline completo de PDF |
| `/api/historicos/[id]` | GET / PATCH / DELETE | Detalle · edición en revisión · borrado (+storage) |
| `/api/historicos/[id]/index` | POST | Aprueba revisión → chunks + embeddings + INDEXED |
| `/api/historicos/[id]/archivo` | GET | Redirect a URL firmada del PDF original |

Helper común: [src/lib/api.ts](../src/lib/api.ts) (`requireTenantContext`,
mapeo de errores a HTTP). `AuditLog` en upload (`HISTORICAL_UPLOADED`) e
indexado (`HISTORICAL_INDEXED`).

## UI

- **/historicos** ([historicos-list.tsx](../src/features/historicos/historicos-list.tsx)):
  tabla con estado (badge), monto, chunks; modal de upload; empty state.
- **/historicos/[id]** ([review-form.tsx](../src/features/historicos/review-form.tsx)):
  pantalla de revisión humana — formulario editable (datos + cajitas), ver PDF
  original, "Guardar" y "Aprobar e indexar". Muestra el texto crudo extraído.
- Design system: primitivos en [src/components/ui/](../src/components/ui/)
  (Button, Input/Textarea/Select/Field, Card, Badge, Modal, Table, Toast,
  EmptyState, Spinner) usando los tokens de `globals.css`.
- Shell de la app con navegación: Panel · Históricos · Generar · Presupuestos ·
  Perfil · Configuración.

## Variables de entorno nuevas (todas opcionales)

```
SUPABASE_URL=                  # storage de PDFs
SUPABASE_SERVICE_ROLE_KEY=
STORAGE_BUCKET=historicos
PDF_EXTRACT_SERVICE_URL=       # microservicio de extracción (si se monta)
GROQ_API_KEY= / OPENAI_API_KEY= / OPENROUTER_API_KEY=
EMBEDDING_PROVIDER=gemini      # gemini | openai
```

## Decisiones de diseño

- **unpdf** en lugar de `pdf-parse` (sin deps nativas, mantenido, serverless).
- Las cajitas semánticas se guardan en `HistoricalBudget.structuredContent`
  (Json) y son **la fuente preferida de chunks** (mejor señal, menos tokens).
- El indexado es **idempotente** (delete + recreate) → "reindexar" = volver a
  llamar al mismo endpoint.
- Degradación con gracia en cadena: sin storage → sin PDF original; sin IA →
  texto crudo + carga manual; sin embeddings → retrieval léxico.
