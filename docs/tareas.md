# Tareas pendientes — Gaps detectados contra la experiencia real de ITZA

> **Qué es este documento.** Inventario exhaustivo (sin priorizar) de lo que le
> falta a CotizaAI para ser un producto vendible, detectado comparando el código
> actual del repo contra la experiencia real y documentada de **ITZA Operativa**
> (`docs/INFO_MAESTRA.md`, `docs/1-SISTEMA_IA_RAG.md`, `docs/7-PRUEBAS_PRESUPUESTADOR.md`
> del proyecto de referencia — ver también [`REFERENCIA-ITZA.md`](../REFERENCIA-ITZA.md)).
> ITZA es single-tenant y ya resolvimos esa parte por diseño (Clerk Organizations,
> `tenantId` en todo); lo que sigue es lo que ITZA tuvo que aprender **a las
> patadas en producción real** y que CotizaAI todavía no cubre.
>
> **Generado:** 2026-06-25, a partir de la lectura completa de los 10 docs de
> ITZA y del código actual de `src/lib/ai`, `src/lib/pdf`, `src/lib/rag`,
> `src/lib/inflation.ts`, `src/lib/integrations/google-drive.ts`, `src/lib/billing`.
> **Cómo mantenerlo:** tachar/mover a "Hecho" cuando se resuelva; agregar items
> nuevos si se detectan más gaps al seguir leyendo el código o al usar el producto
> con clientes reales.

---

## A. Resiliencia de proveedores de IA

### A.1 Sin fallback real entre proveedores ante error
**Por qué:** `src/lib/ai/providers.ts` (`resolveProvider`) elige un proveedor
disponible y listo. Si la llamada real a ese proveedor falla (429 cuota, 503
high-demand, timeout), `chatCompletion`/`callWithTool` **tiran error directo**
— no hay reintento con el siguiente proveedor de `availableProviders()`. ITZA
documenta en vivo (§13.11 de `1-SISTEMA_IA_RAG.md`) que Gemini gratis se queda
sin cupo todo el tiempo y por eso necesitaron rotar Gemini→Mistral→Groq→
Cerebras→OpenRouter→GitHub Models automáticamente.
**Estado:** Pendiente.

### A.2 Sin rotación de múltiples API keys del mismo proveedor
**Por qué:** ITZA tiene 3 keys de Gemini (`GEMINI_API_KEY`, `_ITZA`, `_M`) y rota
entre ellas ante 429/503 antes de caer a otro proveedor. Con cuota gratuita, una
sola key rinde ~30-50 generaciones/día.
**Estado:** Pendiente. Evaluar si conviene para CotizaAI (depende de si se paga
plan Gemini desde el día 1, lo que haría esto innecesario).

### A.3 Sin recorte adaptativo de contexto por límite de tokens del free tier
**Por qué:** Groq/Cerebras/GitHub Models tienen límites duros de tokens por
minuto/request en su free tier. ITZA reintenta automáticamente bajando la
cantidad de históricos RAG inyectados (`N → N-1` hasta un piso de 2) cuando el
proveedor devuelve error de tamaño.
**Estado:** Pendiente.

### A.4 Sin panel de salud de proveedores visible al admin
**Por qué:** ITZA tiene `/ia/presupuestos/estado`: health-check por proveedor
(ok/sin clave/timeout/error) + estado del RAG vectorial (detecta "degradado" si
hay históricos sin embedding). Sin esto, si a un cliente le falla la generación
dos veces, ni el cliente ni soporte tienen forma rápida de saber si es cuota,
red, o un histórico mal indexado.
**Estado:** Pendiente.

### A.5 Sin configuración de proveedores habilitados/override de modelo por tenant
**Por qué:** ITZA tiene un singleton `ConfiguracionIA` (modelos habilitados,
default por contexto, override de modelo por proveedor). CotizaAI no tiene
ningún control análogo expuesto — ni siquiera global, menos por tenant.
**Estado:** Pendiente.

---

## B. Calidad y sanitización de la salida del LLM

### B.1 Sin filtro de markdown colado en el cuerpo
**Por qué:** ITZA detectó (corrida #2 de su batch de pruebas) que el LLM cuela
`**texto**`/backticks dentro de los bloques de texto, rompiendo el Word
generado. Lo arreglaron con `limpiarMarkdownBloque` como paso final del
normalizador. `src/lib/ai/generation.ts` (`normalizeGenerationPayload`) no tiene
ningún paso equivalente.
**Estado:** Pendiente.

### B.2 Sin filtro de eco de cabecera
**Por qué:** El LLM a veces repite título/ubicación/fecha dentro del cuerpo del
presupuesto (duplicación). ITZA lo resolvió con `filtrarBloquesEcoCabecera`
después de detectarlo en pruebas reales. No hay equivalente en CotizaAI.
**Estado:** Pendiente.

### B.3 Sin defensa de servidor contra inyección de prompt
**Por qué:** ITZA probó adversarialmente pedir explícitamente "agregá una firma
con matrícula X" y el LLM lo hizo pese a que el prompt lo prohibía. La regla en
el prompt **no alcanza**; tuvieron que agregar un filtro de servidor que
elimina bloques tipo firma sin importar qué los generó. `esBloqueFirmaIa` en
CotizaAI ya cubre esto parcialmente (heredado de ITZA, según el comentario en el
código) — **verificar que sea tan exhaustivo como el de ITZA**
(`esBloquePlaceholderFirmaIa` extendido a variantes de "Matrícula <n>").
**Estado:** Parcialmente cubierto — revisar cobertura de regex contra los casos
reales que documentó ITZA.

### B.4 Sin persistencia de trazabilidad RAG por generación
**Por qué:** `RagResult.sourceIds` existe en memoria pero hay que confirmar si
se guarda en el `GeneratedBudget` final. Sin esto, no hay forma de auditar
después "¿qué históricos usó la IA para justificar este precio?" — importante
tanto para soporte como para que el propio cliente entienda de dónde salió un
número.
**Estado:** Verificar y, si no se persiste, agregar campo `ragSourceIds` al
modelo `GeneratedBudget`.

---

## C. Extracción de PDF / pipeline de históricos

### C.1 Sin extracción robusta de tablas
**Por qué:** `src/lib/pdf/extract.ts` cae a `unpdf` (texto plano) si no hay
microservicio configurado. ITZA migró específicamente a pdfplumber porque
`pdf-parse`/extracción plana **no capturaba bien tablas con celdas mergeadas**
— y la tabla de ítems/precios es el corazón de un presupuesto real. Sin esto,
el histórico indexado pierde justo la parte más valiosa.
**Estado:** Pendiente — evaluar si el `PDF_EXTRACT_SERVICE_URL` configurado en
producción usa pdfplumber o equivalente; si no, es un gap real de calidad.

### C.2 Sin soporte de fuentes más allá de PDF
**Por qué:** ITZA soporta PDF, Google Docs (export a PDF), Word (.docx),
Google Sheets y Excel (.xlsx) como fuente de histórico — con ~65% de cobertura
real medida sobre 1.686 archivos de Drive. CotizaAI solo ingesta PDF
(`ingestPdfHistorical` está tipado específicamente a PDF).
**Estado:** Pendiente. Muchas pymes van a tener presupuestos viejos en Word o
Excel, no solo PDF.

### C.3 Sin OCR para escaneados
**Por qué:** Un PDF escaneado sin texto cae directo a `EmptyPdfTextError` sin
alternativa. ITZA tampoco lo resuelve (lo marca como "No posible hoy" para
JPEG/PNG), pero lo documentan como gap conocido — vale la pena que CotizaAI no
lo repita silenciosamente: al menos mostrarle al usuario que necesita resubir
una versión con texto.
**Estado:** Pendiente (baja prioridad técnica, alta prioridad de UX/mensaje
de error claro).

### C.4 Límite de extracción fijo, sin chunking adaptativo
**Por qué:** `MAX_EXTRACTION_INPUT_CHARS = 30_000` es un corte fijo. ITZA
terminó troceando adaptativamente (`maxInputChars` bajado de 100k a 16-18k)
según el proveedor para no pasarse de su límite de tokens por minuto.
**Estado:** Pendiente — bajo riesgo mientras se use un solo proveedor estable,
pero relevante si se agregan proveedores de free tier más limitados.

### C.5 Sin lista de "archivos incompatibles" persistida
**Por qué:** ITZA tiene `DriveArchivoIncompatible` para no reintentar archivos
que nunca van a poder procesarse (CAD, GIS, audio/video). Si CotizaAI permite
subir cualquier archivo desde Drive sin este registro, vuelve a intentar
procesar lo mismo cada vez.
**Estado:** Pendiente (depende de D.1).

---

## D. Importación masiva / Google Drive

### D.1 Sin importación en lote con progreso
**Por qué:** `src/lib/integrations/google-drive.ts` lista (`listPdfs`) y
descarga (`downloadFile`) de a uno. ITZA tiene `batch-from-drive`: SSE con
progreso en tiempo real, rate-limit de 1.3s entre archivos, retry de 35s en
429, idempotente por `driveFileId`. Subir 50-200 históricos de a uno es
inviable para el onboarding real de un cliente nuevo.
**Estado:** Pendiente — probablemente el gap de mayor impacto en onboarding.

### D.2 Sin recorrido recursivo de carpetas (BFS)
**Por qué:** `listPdfs` busca con un query plano (`mimeType='application/pdf'`)
sin recorrer subcarpetas. ITZA recorre toda la jerarquía con BFS + caché en
sessionStorage. Si el cliente tiene sus PDFs organizados en carpetas por
año/cliente (lo más común), CotizaAI hoy no los encuentra.
**Estado:** Pendiente.

### D.3 Sin deduplicación por `driveFileId`
**Por qué:** Sin un registro de qué `driveFileId` ya se importó, reimportar la
misma carpeta crea históricos duplicados.
**Estado:** Pendiente.

### D.4 Solo lee PDFs desde Drive
**Por qué:** El query de `listPdfs` está hardcodeado a
`mimeType='application/pdf'`. No lista Docs/Sheets/Word/Excel (ver C.2).
**Estado:** Pendiente.

---

## E. Calidad de datos / auditoría de históricos

### E.1 Sin auditoría de históricos sospechosos
**Por qué:** ITZA tiene `AuditoriaHistoricosSection`: detecta duplicados
exactos (mismo título+monto+ubicación), históricos con datos incompletos
(faltan ≥2 de tareas/entregables/descripción/monto/ubicación), sin área
asignada, títulos sospechosos. CotizaAI no tiene ningún chequeo de salud de
los datos que entran al RAG — si un cliente carga 100 PDFs y 15 quedan con
extracción pobre, nadie se entera hasta que un presupuesto generado sale raro.
**Estado:** Pendiente.

### E.2 Sin panel de revisión masiva con filtros avanzados
**Por qué:** El estado `PENDING_REVIEW` existe en `HistoricalBudget`, pero no
hay (o no se confirmó) un filtro por moneda, rango de monto, con/sin
embedding, fecha — equivalente al `HistoricoSearchFilterBar` de ITZA. Sin
filtros, revisar 100+ históricos pendientes es inviable en la práctica.
**Estado:** Verificar alcance actual de `/historicos`; completar si falta.

---

## F. Testing y QA del generador

### F.1 Sin harness de pruebas del generador
**Por qué:** ITZA construyó una metodología completa (`pruebas/prueba-presupuesto.ts`):
A=histórico de referencia, B=memoria RAG real, C=salida generada, comparados
con una matriz de 11 criterios (retrieval correcto, cobertura de secciones,
cantidad de tareas, longitud, precio, eco de cabecera, etc.). Llegaron a un
score medible de **0.93/1.00** sobre 44 presupuestos evaluados. CotizaAI no
tiene ningún mecanismo de este tipo.
**Estado:** Pendiente. Sin esto, no hay forma de demostrar (en una demo a un
cliente potencial, o internamente antes de un release) que el RAG selecciona
bien los históricos y que la generación es fiel — solo "probarlo a ojo".

### F.2 Sin modo debug para inspeccionar memoria RAG y prompt real
**Por qué:** ITZA tiene un "Debug mode" en la UI con 3 botones: ver memoria RAG
completa, ver prompt de sistema completo, ver JSON crudo de la IA. Sin esto,
cuando un cliente reporta "la IA generó algo raro", no hay forma rápida de
reproducir qué vio el modelo exactamente.
**Estado:** Pendiente.

### F.3 Sin tests automatizados en general
**Por qué:** ITZA tampoco los tiene ("No hay runner de tests configurado") y lo
reconoce como debilidad. Para un producto que se vende a múltiples clientes
pagos (a diferencia de una app interna de una sola empresa), la ausencia de
tests pesa mucho más — un bug en `generation.ts` o `inflation.ts` afecta a
todos los tenants a la vez.
**Estado:** Pendiente.

### F.4 Sin comando de diagnóstico para soporte
**Por qué:** ITZA tiene comandos read-only (`overview`, `dump <id>`,
`rag "<pedido>"`) para que alguien de soporte pueda investigar un caso
puntual sin tocar producción. CotizaAI no tiene ninguna herramienta equivalente.
**Estado:** Pendiente.

---

## G. Multidivisa / inflación

### G.1 Un solo adaptador de inflación (INDEC/AR)
**Por qué:** `src/lib/inflation.ts` está bien generalizado (`country`/`currency`
en `InflationIndex`, fórmula pluggable), pero `syncIndecIndices` es el único
adaptador implementado. Si CotizaAI vende a un cliente fuera de Argentina, no
hay fuente de datos automática — solo carga manual.
**Estado:** Pendiente (no urgente mientras el mercado inicial sea AR, pero
documentado para cuando se expanda).

### G.2 Sin flujo de sync de inflación expuesto en la UI del tenant
**Por qué:** Falta confirmar si `/perfil` o `/configuracion` ya tiene un botón
equivalente al "↑ Actualizar inflación" de ITZA (sync + refresh en un clic con
feedback "X meses sincronizados"). Si no existe, el ajuste por inflación queda
desactualizado salvo que alguien lo dispare manualmente vía script/admin.
**Estado:** Verificar y completar si falta.

---

## H. Observabilidad / operación

### H.1 Sin dashboard de consumo visible para el tenant
**Por qué:** `recordUsage` registra uso por tenant en la base, pero no hay
confirmación de un dashboard donde el ADMIN del tenant vea su consumo de
tokens/generaciones contra el límite de su plan (`PLANS` en
`src/lib/billing/plans.ts` define los límites, pero el cliente necesita verlos
reflejados en tiempo real).
**Estado:** Pendiente.

### H.2 Sin alertas de proximidad a límite de plan
**Por qué:** Si un tenant se acerca a `generationsPerMonth` o `maxHistoricals`,
no hay notificación — se entera cuando el límite ya lo bloquea.
**Estado:** Pendiente.

### H.3 Sin monitoreo de errores centralizado
**Por qué:** No se detectó integración con Sentry o equivalente en ningún
`lib`. Para múltiples tenants en producción, un error silencioso en un tenant
puede pasar desapercibido.
**Estado:** Pendiente.

---

## I. Seguridad

### I.1 Refresh token de Google Drive en texto plano
**Por qué:** `google-drive.ts` guarda `integration.refreshToken` sin cifrar en
`TenantIntegration`. Ya está anotado en el backlog de `CLAUDE.md` ("Cifrado
at-rest del refreshToken de Google Drive") — se confirma real al leer el código.
**Estado:** Pendiente (ya en backlog de CLAUDE.md).

### I.2 Sin rate limiting de abuso a nivel de API routes
**Por qué:** Los límites de plan (`PlanLimits`) son de negocio, no de
protección contra abuso/scripted requests. No se detectó rate limiting general
en las rutas de generación/extracción.
**Estado:** Pendiente.

### I.3 Sin política de exportación/borrado de datos al cancelar
**Por qué:** Si un tenant cancela su suscripción, no hay flujo definido de
exportar todo su histórico antes de borrarlo, ni de cuánto tiempo se retienen
los datos. Relevante tanto por buena práctica comercial como por compliance
(GDPR-like) si se vende a clientes europeos en el futuro.
**Estado:** Pendiente.

---

## J. Producto comercial / billing / onboarding

### J.1 Sin customer portal de Stripe
**Por qué:** Ya está en el backlog de `CLAUDE.md` — el cliente no puede
cambiar de plan o cancelar self-serve, solo vía checkout inicial.
**Estado:** Pendiente (ya en backlog de CLAUDE.md).

### J.2 Sin onboarding guiado de carga masiva de históricos
**Por qué:** El primer momento de valor de CotizaAI depende de que el tenant
cargue su histórico. Sin import masivo desde Drive (ver D.1) ni un wizard que
acompañe ese paso crítico, el onboarding self-serve real queda cojo aunque el
checkout de Stripe funcione perfecto.
**Estado:** Pendiente — depende de resolver D.1 primero.

### J.3 Sin página de ayuda/FAQ embebida
**Por qué:** ITZA tiene un modal "Ayuda" con guía de cómo redactar el pedido a
la IA. Un usuario nuevo sin contexto de qué tan detallado escribir el pedido
puede frustrarse con resultados pobres en el primer intento.
**Estado:** Pendiente.

### J.4 Sin status page / comunicación de incidentes
**Por qué:** Si un proveedor de IA cae (ver A.1-A.4) o Drive falla, el cliente
no tiene dónde chequear si es un problema conocido.
**Estado:** Pendiente (baja prioridad en etapas tempranas).

---

## K. Documento generado (.docx / .pdf)

### K.1 Verificar manejo de salto de página con contenido largo
**Por qué:** ITZA tuvo que calibrar a mano un estimador de altura con buffer de
seguridad para que la franja de pie de página no se solape con el cuerpo en
presupuestos largos. Si el branding por tenant en CotizaAI permite logo/footer
custom de tamaño variable, este mismo problema va a aparecer apenas un cliente
genere un presupuesto largo.
**Estado:** ✅ **No es un gap.** Verificado generando un `.docx` con 48 bloques
(12 secciones × título+párrafo largo+lista+tabla) — sin errores. A diferencia
de ITZA, `budget-docx.ts` usa un `Footer` **nativo** de `docx` (texto que Word
repagina solo en cada página), no una imagen flotante anclada al borde
inferior de la página. Por diseño, CotizaAI nunca tuvo el problema que forzó a
ITZA a construir un estimador de altura: no hay nada flotante con lo que el
cuerpo pueda solaparse.

### K.2 Verificar soporte de múltiples firmantes
**Por qué:** ITZA soporta hasta 3 firmas por fila con catálogo de profesionales
reutilizable. Confirmar si `/perfil` en CotizaAI ya cubre múltiples firmantes
guardados o asume un solo firmante por tenant.
**Estado:** ✅ **No es un gap.** `signatureSection()` en `budget-docx.ts` ya
soporta N firmantes (`branding.signers: Signer[]`) agrupados de a
`MAX_FIRMAS_POR_FILA = 3` por fila, con tantas filas como haga falta —
verificado con un caso de 4 firmantes (2 filas). Cada firmante tiene imagen de
firma (o línea para rubricar si no cargó una), nombre y cargo.

---

## L. Mobile / UX

### L.1 Carga de históricos desde el celular
**Por qué:** El propio `tareas.md` de ITZA señala como pendiente "que sea fácil
cargar horas y gastos desde el celular". Análogamente, muchos dueños de pyme
van a querer fotografiar/subir un presupuesto viejo desde el teléfono al darse
de alta. No se validó el flujo de upload de históricos en mobile.
**Estado:** Pendiente — validar con dispositivo real antes de lanzar.

---

## M. Infraestructura

### M.1 Sin script de reindexado masivo de embeddings
**Por qué:** ITZA tiene `backfill-embeddings.ts` para reindexar todo si se
cambia de proveedor de embeddings (Gemini↔OpenAI) o de dimensión de vector.
Confirmar si existe un equivalente en CotizaAI antes de necesitarlo en
producción con datos reales de clientes.
**Estado:** Verificar y crear si falta.

### M.2 Migraciones versionadas
**Por qué:** ITZA nunca adoptó `prisma migrate` (solo `db push`) y lo tiene
como deuda pendiente en su propio `tareas.md`.
**Estado:** ✅ Ya resuelto en CotizaAI — el repo usa `prisma/migrations/`
versionadas. Mencionado acá solo para registrar que es una ventaja ya
adquirida, no un gap.

---

*Documento generado el 2026-06-25 a partir de la lectura completa de los 10 docs
de ITZA Operativa (`INFO_MAESTRA.md`, `FUNCIONALIDADES.md`,
`1-SISTEMA_IA_RAG.md`, `2-PRESUPUESTO_WORD_FORMATO.md`,
`3-PRESUPUESTOS_HISTORICOS_ODOO_DRIVE.md`, `4-MARKITDOWN_PIPELINE.md`,
`5-INFLACION_INDEC.md`, `6-GUIA_GOOGLE_DRIVE.txt`,
`7-PRUEBAS_PRESUPUESTADOR.md`, `tareas.md`) cruzados contra el código real de
`src/lib/ai`, `src/lib/pdf`, `src/lib/rag`, `src/lib/inflation.ts`,
`src/lib/integrations/google-drive.ts` y `src/lib/billing` en este repo.*
