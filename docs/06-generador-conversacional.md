# Generador conversacional (rediseño de /generar)

> Hito completado el 2026-06-11. La pantalla de generación pasó de un textarea
> con botón a una experiencia conversacional estilo Gemini, tomando las mejores
> ideas del chat del generador de ITZA adaptadas al design system CotizaAI.

## Experiencia

### Estado vacío (estilo Gemini)

- Saludo con **gradiente de marca** (aqua → azul → naranja) y el nombre del
  usuario (Clerk `firstName`), con frase de bienvenida que rota según el uso
  del mes (determinística server-side → sin mismatch de hidratación, sin
  `Math.random` en render que el compilador de React prohíbe).
- Glow radial aqua de fondo (blur) como en ITZA.
- **3 tarjetas de sugerencia** clickeables que rellenan el compositor; la
  primera se adapta al rubro del tenant (`CompanyProfile.industry`).

### Conversación

- Burbujas: usuario a la derecha (aqua), asistente a la izquierda con avatar
  gradiente y `Sparkles`.
- **Burbuja de espera con fases reales del pipeline** rotando cada 2,6s:
  "Buscando históricos relevantes…" → "Ajustando precios por inflación…" →
  "Redactando el presupuesto…" → "Armando bloques y tablas…".
- **Tarjeta de resultado** por generación: título, total formateado, badges de
  trazabilidad (RAG vectorial/léxico/sin históricos, cantidad de históricos
  usados, modelo) y acciones directas: **Abrir en el editor**, **Word**, **PDF**
  (sin salir del chat — se puede seguir generando variantes).
- Errores como burbuja con **Reintentar** (reenvía el mismo prompt).
- Chip "Se usó: {modelo} · {modo RAG}" en la barra superior (idea de ITZA) +
  botón "Nueva conversación".

### Compositor (pill estilo Gemini)

- Textarea **auto-expandible** (1 línea → max-h), **Enter genera**,
  Shift+Enter hace salto de línea; botón redondo de enviar con flecha.
- Selector de **nivel de detalle** (Breve / Normal / Detallado) como segmented
  control.
- **Contador de generaciones restantes** del plan del mes (en rojo cuando se
  agota), actualizado en vivo tras cada generación.

## Cambios de API — `POST /api/generar`

- Body acepta `nivelDetalle: "breve" | "normal" | "detallado"` (default
  normal). La instrucción de formato se agrega al prompt **solo para la IA**;
  en `GeneratedBudget.requestPrompt` se guarda el pedido original del usuario.
- La respuesta ahora incluye lo que la tarjeta necesita:
  `{ budget: {id, title, totalAmount, currency}, ragMode, sourceCount,
  provider, model }`.

## Archivos

- [src/features/generar/generar-chat.tsx](../src/features/generar/generar-chat.tsx)
  — componente principal (chat completo).
- [src/app/(app)/generar/page.tsx](../src/app/(app)/generar/page.tsx) — server
  component: nombre (Clerk), rubro, límite de generaciones y frase.
- [src/app/api/generar/route.ts](../src/app/api/generar/route.ts) — nivel de
  detalle + respuesta enriquecida.
- Se eliminó `src/features/presupuestos/generar-form.tsx` (reemplazado).

## Editor embebido (estilo constructor de ITZA)

Al generar, el **editor de bloques se abre en un panel a la derecha del chat**
(pantallas `xl+`), igual que el constructor de ITZA junto a su chat:

- Se reutiliza el mismo [BudgetEditor](../src/features/presupuestos/budget-editor.tsx)
  de `/presupuestos/[id]` con la prop `embedded` (oculta el link "volver").
  Sin fetch extra: `POST /api/generar` ahora devuelve el `content` completo.
- Header del panel: "Borrador generado" + abrir en pantalla completa + cerrar.
- La tarjeta del chat marca el presupuesto activo ("Editándose en el panel →");
  en pantallas chicas el panel no existe y el botón "Abrir en el editor"
  navega a la página completa.
- Guardar / Marcar FINAL / exportar funcionan igual dentro del panel
  (`PATCH /api/presupuestos/[id]`).

**Sin scroll de página**: el `main` del layout autenticado pasó a
`flex flex-col`, y el generador usa `flex-1 min-h-0` — llena exactamente el
alto del viewport; solo scrollean internamente el hilo del chat y el panel
del editor.

## Diferencias deliberadas con ITZA

- Acá cada turno = **un presupuesto persistido** (DRAFT) que se abre al toque
  en el panel; ITZA mantiene una conversación multivuelta sobre un único
  borrador. La multivuelta ("ajustá el ítem 3") queda como evolución natural
  sobre esta misma UI.
- Sin adjuntos en el chat (los PDFs entran por Históricos/Drive, que es el RAG).
- Selector de proveedor IA no expuesto al usuario final (CotizaAI es producto
  comercial; el proveedor se resuelve server-side con fallback).
