# REFERENCIA-ITZA.md

> **Propósito de este documento.** Resumen propio y destilado del proyecto de
> referencia **ITZA Operativa** (`c:\Users\santi\Desktop\app-itza2026`), escrito
> como memoria de trabajo para construir **CotizaAI** (el SaaS multi-tenant nuevo).
> Sirve para no tener que releer el proyecto original cada vez.
>
> **Regla de propiedad (crítica):** ITZA se usa SOLO como referencia conceptual y
> de arquitectura. NO se copia código verbatim ni se reutilizan datos/PDFs reales.
> CotizaAI se construye limpio desde cero y multi-tenant.
>
> **Generado:** 2026-06-09 · a partir de `CLAUDE.md`, `docs/INFO_MAESTRA.md`,
> `docs/1-SISTEMA_IA_RAG.md` y `docs/5-INFLACION_INDEC.md` del proyecto original.

---

## 1. Qué es ITZA y qué hace bien

**ITZA Operativa** es una PWA corporativa interna para **una sola** firma de
ingeniería argentina. Hace varias cosas (registro de horas, gastos, directorio
de empleados/proyectos sincronizado con Odoo ERP), pero **lo que nos interesa
replicar es su generador de presupuestos con IA + RAG**. El resto (Odoo,
timesheets, gastos) es específico de ITZA y **no se replica** en CotizaAI.

### Lo que hace muy bien (y vale la pena replicar)

1. **Motor RAG dual robusto**: combina búsqueda léxica (siempre disponible, sin
   dependencias) con búsqueda vectorial (pgvector, opt-in) y **fallback
   automático** del vectorial al léxico. Nunca se rompe la generación por un fallo
   de embeddings.
2. **Ajuste por inflación INDEC**: actualiza precios históricos a valor presente
   en runtime. Es un diferencial enorme para Argentina/LATAM y está muy bien
   resuelto (dato derivado, no persistido).
3. **Pipeline de extracción de PDF con fallback**: microservicio MarkItDown
   (Python/FastAPI) → `pdf-parse` si falla. Extrae "cajitas semánticas" con un LLM
   rápido para no inyectar el PDF crudo al prompt (ahorra hasta ~60% de tokens).
4. **Multi-proveedor de IA con catálogo configurable**: Groq, Gemini, OpenAI,
   OpenRouter, todos detrás de un catálogo (`iaProveedores.ts`) habilitable por
   admin vía un singleton `ConfiguracionIA`.
5. **Contrato IA ↔ App estructurado y auto-reparable**: el LLM devuelve JSON con
   bloques tipados (`titulo`/`parrafo`/`lista`/`tabla`/`imagen`); una capa de
   normalización repara salidas malformadas (clave `tipo`→`type`, etc.).
6. **Generación Word (.docx) con branding**: membrete flotante, firmas, saltos de
   página calculados. El entregable se revisa en Google Docs y se exporta a PDF.

### Lo que es específico de ITZA y NO se replica

- Integración con **Odoo ERP** (XML-RPC): empleados, timesheets, gastos, ventas.
  CotizaAI no tiene ERP; el histórico lo sube el propio tenant.
- **Google Drive** como fuente de PDFs (service account a una carpeta fija de
  ITZA). En CotizaAI el usuario sube los PDFs directamente (upload propio).
- Roles `ADMIN`/`EMPLOYEE` pensados para una sola empresa. CotizaAI necesita
  roles **por tenant** (owner/admin/member).
- Disciplinas de ingeniería hardcodeadas (`agrimensura`, `hidraulica`…). En
  CotizaAI el "rubro" es **configurable por tenant** (esa es la tesis del producto).

---

## 2. Stack del proyecto de referencia

| Capa | ITZA usa | Notas para CotizaAI |
|------|----------|---------------------|
| Framework | Next.js 16 (App Router) | Mantener |
| UI | React 19 | Mantener |
| Lenguaje | TypeScript strict, sin `any` | Mantener |
| Estilos | Tailwind CSS v4 + CSS vars | Mantener; sistema de diseño propio (DESIGN.md) |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Mantener |
| DB | PostgreSQL/Supabase + pgvector | Mantener |
| Auth | NextAuth v5 beta (JWT, Credentials) | **Decisión abierta**: NextAuth v5 vs Clerk para self-serve multi-tenant |
| Email | Resend | Mantener |
| IA | Gemini SDK + Groq/OpenAI/OpenRouter vía fetch | Mantener catálogo multi-proveedor |
| Embeddings | Gemini `gemini-embedding-001` (768D) / OpenAI `text-embedding-3-small` (1536D) | Mantener; default Gemini por costo |
| Documentos | `docx`, `pdf-parse`, `@react-pdf/renderer` | Mantener |
| Extracción | Microservicio MarkItDown (FastAPI, Render) | Evaluar replicar o alternativa serverless |

---

## 3. Motor RAG (léxico + vectorial) — el corazón a replicar

**Idea central:** antes de llamar al LLM, se enriquece el prompt con contexto real
de la empresa (presupuestos históricos relevantes). En ITZA las fuentes son dos
(históricos internos + ventas Odoo); **en CotizaAI la única fuente serán los
históricos del tenant** — más simple y más limpio.

### Orquestador (`buildPresupuestoRagMemoria`)

```
Entradas: { mensajeUsuario, disciplinasIds[], modoRag: "lexico" | "vectorial" }

1. Cargar pool de históricos (limitado por POOL_MAX, default 200)
2. Cargar índices de inflación (mismo Promise.all)
3. Si vectorial → buscar por embedding (con fallback silencioso a léxico)
4. Rankear top-N relevantes (default 3 históricos al prompt)
5. Formatear como bloques de texto (con monto actualizado por inflación)
6. Inyectar al prompt maestro
```
Si la DB falla → devuelve `""` y la generación continúa sin RAG (no rompe).

### Modo léxico (default, 100% TypeScript)

1. **Normalización**: minúsculas + sin tildes (NFD) + colapsar espacios.
2. **Tokenización**: split, quita stopwords ES + palabras genéricas del pedido
   ("quiero", "presupuesto", "cotización"), tokens ≥3 chars.
3. **Anclas (anchors)**: términos de negocio concretos extraídos del propio pool
   (áreas, líneas de producto/tareas) que matchean el pedido. Detección por
   match exacto → match parcial → subcadena → **Levenshtein adaptativo**:

   | Longitud palabra | Distancia máx. |
   |------------------|----------------|
   | <5 chars | 0 (sin fuzzy) |
   | 5–8 | 1 |
   | 9–12 | 2 |
   | >12 | 3 |

4. **Filtrado duro**: si hay anclas, se filtra el pool; si el filtro deja 0
   resultados, se **aborta el filtro** y se usa el pool completo (nunca dejar al
   LLM sin ejemplos).
5. **Scoring**: por cada término, suma peso según longitud (≥10→+4, ≥7→+3, ≥5→+2).
   El score sobre el **área/rubro pesa más** que el score sobre el texto completo.
   Orden: `scoreArea DESC → scoreFull DESC → fecha DESC`.
6. **Límite final al prompt**: top 3 históricos (configurable).

### Modo vectorial (opt-in, pgvector)

- Embeddings con Gemini `gemini-embedding-001` (768D, default, gratis hasta 1.500
  req/día) u OpenAI `text-embedding-3-small` (1536D).
- Columna `embedding vector(768)` **gestionada con SQL crudo** (`$queryRaw`/
  `$executeRaw`), NO en el schema Prisma. Índice `ivfflat` con `vector_cosine_ops`.
- Búsqueda por `embedding <=> vector` (distancia coseno).
- **Fallback automático**: si falla (sin key, sin columna, error de red), cae al
  léxico sin romper; la UI muestra "Fallback".
- Reindexado masivo con un script (`backfill-embeddings.ts`) respetando rate limit.

### Falencias conocidas (que CotizaAI debe mejorar desde el día 1)

| Problema | Mejora para CotizaAI |
|----------|----------------------|
| 🔴 Scoring léxico O(N×M) bloquea el event loop con pools grandes | Delegar prefiltro a Postgres; vectorial como **default**, no opt-in |
| 🔴 Sin caché: cada turno reconstruye el RAG | Cache con TTL por tenant+query |
| 🟡 PDFs adjuntos saturan tokens | Chunking + retrieval sobre los chunks |
| 🟡 JSON parsing frágil (3 reintentos) | Usar **Tool/Function Calling** nativo (Groq/OpenAI/Gemini lo soportan) |
| 🟢 Disciplinas/aliases hardcodeados | **Rubro configurable por tenant** (es la tesis del producto) |
| 🟢 Sin trazabilidad de qué ejemplos usó el LLM | Guardar `ragFuentesIds` por generación |

---

## 4. Pipeline de extracción de PDF

**Flujo dual (`historicoPdfExtractPipeline.ts`):**
1. Intenta el microservicio **MarkItDown** (Python/FastAPI, dockerizado en Render):
   convierte PDF/DOCX/XLSX → markdown estructurado.
2. Si falla → fallback a `pdf-parse` (texto plano).
3. Un **LLM rápido** extrae "cajitas semánticas": `condiciones_comerciales`,
   `entregables`, `productos_equipos`, `tareas_detalladas`.
4. **Revisión humana** antes de guardar.
5. **Optimización de tokens**: si la extracción semántica salió bien, el RAG omite
   el texto crudo del PDF.

**Para CotizaAI:**
- Reemplazar Google Drive por **upload directo** del usuario (el tenant sube sus
  PDFs). Guardar en object storage (Supabase Storage / S3) con `tenantId`.
- Mantener el pipeline dual (extracción estructurada + fallback) — es robusto.
- Evaluar si el microservicio MarkItDown se replica (es lo que mejor extrae tablas)
  o si se usa una alternativa serverless / librería JS según costo y despliegue.

---

## 5. Ajuste por inflación (diferencial LATAM)

**Fórmula:** `montoActualizado = montoHistorico × ∏(1 + porcentajeMensual)` desde
el mes siguiente al documento hasta el mes anterior al actual.

- Solo aplica a montos en **ARS** (USD/EUR quedan sin ajuste).
- **No se persiste**: es un derivado, se recalcula en runtime (siempre consistente
  con los índices vigentes; cambiar un índice recalcula todo sin migraciones).
- Tabla `IndiceInflacion` (`año`, `mes`, `porcentajeMensual` decimal, `fuente`),
  unique `[año, mes]`.
- Fuente: API pública INDEC `apis.datos.gob.ar` (serie IPC Nacional,
  `representation_mode=percent_change`), sin auth.
- Función pura `calcularFactorInflacionDesdeIndices(fecha, indices[])` que recibe
  los índices ya cargados → evita N queries.
- En el RAG, al histórico se le pasa el monto actualizado con instrucción explícita
  al LLM: **"USAR ESTE VALOR como referencia de precio real actual"**.

**Para CotizaAI (generalizar):**
- Hacer el índice **pluggable por país/moneda**: INDEC para AR, pero diseñar
  `InflationIndex` con `country`/`currency` para sumar IPC de otros países (o un
  índice manual). El cálculo es el mismo; solo cambia la fuente.
- Multi-moneda real: cada presupuesto tiene su moneda; el ajuste aplica según la
  moneda y el índice configurado para esa moneda.

---

## 6. Generación de documentos Word (.docx)

- Librería `docx`; descarga con `file-saver`.
- Membrete = imagen flotante `behindDocument` anclada a la página (logo + fondo).
- Franja de clientes, firmas en tabla sin bordes (el usuario las dibuja en la UI;
  **el LLM nunca genera bloques de firma**).
- Salto de página al cierre con buffer de seguridad que absorbe la divergencia
  estimador ↔ layout real de Word.
- Entregable: el `.docx` se revisa en Google Docs y desde ahí se exporta a PDF.

**Para CotizaAI (generalizar):**
- El **branding es por tenant**: logo, colores, datos de la empresa → se inyectan
  al generar el documento. La plantilla Word debe leer el branding del tenant, no
  constantes hardcodeadas.
- Ofrecer export a **PDF** directo además de Word (muchos rubros no usan Word).

---

## 7. Contrato IA ↔ App (estructura del presupuesto)

Respuesta JSON del LLM:
```ts
{ respuestaTipo: "chat", mensajeAsistente: string }        // modo conversación
{ respuestaTipo: "presupuesto", presupuesto: {...} }        // modo generación
```
El presupuesto tiene `titulo`, `cotizacion_total`, `forma_pago`, `profesionales[]`
y un `cuerpo[]` de bloques tipados:
```ts
type BloqueCuerpo =
  | { type: "titulo"|"subtitulo"|"parrafo"; texto: string }
  | { type: "lista"; items: string[] }
  | { type: "tabla"; encabezados: string[]; filas: string[][] }
  | { type: "imagen"; base64: string; leyenda?: string }
```
Capa de normalización (`normalizarSalidaPresupuestoIa`) repara: `tipo`→`type`,
`text/content/body`→`texto`, elimina firmas placeholder, parsea totales con formato
argentino, fusiona `descripcion` al cuerpo.

**Para CotizaAI:** mantener el contrato de bloques (es genérico y sirve para
cualquier rubro), pero migrar a **Tool/Function Calling** para eliminar el parsing
frágil. El schema de bloques se valida con **Zod**.

---

## 8. Multi-tenancy: lo que ITZA NO tiene y CotizaAI SÍ necesita

ITZA es **single-tenant** (una empresa). El salto conceptual clave para CotizaAI:

| Aspecto | ITZA (single) | CotizaAI (multi-tenant) |
|---------|---------------|--------------------------|
| Empresa | Implícita (es ITZA) | Modelo `Tenant` explícito |
| Usuarios | `User` global | `User` ∈ `Tenant` con `Membership` y rol por tenant |
| Históricos | Tabla global | `tenantId` en cada fila; **toda query filtra por tenant** |
| Embeddings | Pool global | Búsqueda vectorial **acotada al tenant** |
| Rubro/perfil | Hardcodeado (disciplinas ITZA) | `CompanyProfile` editable por tenant (prompt del rubro) |
| Branding | Constantes en código | Por tenant (logo, colores, datos) |
| Proveedores IA | Singleton `ConfiguracionIA` | Default global + override por tenant; **tracking de tokens por tenant** |
| Billing | No existe | Suscripción por tenant (Stripe / Mercado Pago) |

**Regla de oro de CotizaAI:** todo acceso a datos pasa por un helper que **siempre
recibe `tenantId`** (derivado de la sesión), nunca confía en un `tenantId` del body
del cliente. Aislamiento de embeddings garantizado en la query vectorial.

---

## 9. Ideas a replicar vs. mejorar/generalizar (resumen)

**Replicar tal cual (probado en producción):**
- RAG dual con fallback léxico.
- Ajuste por inflación como dato derivado en runtime.
- Pipeline de extracción dual de PDF con revisión humana.
- Catálogo multi-proveedor de IA.
- Contrato de bloques tipados para el presupuesto.
- Generación Word con membrete/branding.

**Mejorar desde el día 1:**
- Vectorial como **default** (no opt-in); prefiltro en Postgres para no bloquear
  el event loop.
- **Tool/Function Calling** en vez de parsing de JSON frágil.
- Caché de RAG por tenant+query.
- Validación de env con Zod.
- Trazabilidad: guardar qué históricos usó cada generación.

**Generalizar para multi-tenant:**
- `tenantId` en todo; aislamiento de embeddings.
- Rubro/perfil **configurable por tenant** (reemplaza disciplinas hardcodeadas).
- Branding por tenant en los documentos.
- Inflación **pluggable por país/moneda** (INDEC es solo el primer adaptador).
- Upload directo de PDFs (reemplaza Google Drive).
- Tracking de uso de tokens por tenant (pricing y límites).

---

*Documento de referencia para CotizaAI. Mantener actualizado si se profundiza en
algún subsistema del proyecto original.*
