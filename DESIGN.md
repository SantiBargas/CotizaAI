# DESIGN.md — Sistema de diseño de CotizaAI

Sistema de diseño y branding del producto. **Toda pantalla nueva debe respetar
este documento.** Mantener actualizado al evolucionar el design system.

> **Dirección visual:** profesional y moderno, minimalismo estratégico (cada
> elemento se gana su lugar). Paleta basada en los colores **Miami Dolphins
> 2013–2017** (aqua / azul / naranja), adaptada a un look SaaS confiable.

---

## 1. Branding

- **Nombre:** CotizaAI (provisorio).
- **Wordmark:** `Cotiza` en azul (`--brand-blue`) + `AI` en aqua (`--brand-aqua`).
- **Logo provisorio:** cuadrado redondeado (radio 14px) con degradé aqua→azul y un
  glifo de documento con un destello (✦) en naranja. Versión monocromo (aqua) para
  fondos oscuros.
- **Tono de marca:** claro, confiable, "tu socio para cotizar rápido y bien".
  Profesional sin ser acartonado.

---

## 2. Paleta de color

### Colores de marca (Dolphins 2013–2017)

| Token | HEX | Uso |
|-------|-----|-----|
| `--brand-aqua` | `#008E97` | Color primario: botones, links, estados activos |
| `--brand-aqua-700` | `#006E76` | Hover/pressed de primario |
| `--brand-blue` | `#005778` | Headers, texto de marca, profundidad |
| `--brand-blue-900` | `#003B52` | Texto oscuro de marca, fondos navy |
| `--brand-orange` | `#F58220` | Acento de acción / highlights (usar con moderación) |
| `--brand-orange-600` | `#D86E12` | Hover del acento |

> **Regla de uso del naranja:** es un acento, no un color de fondo. Úsalo para
> CTAs secundarios, badges de "nuevo", destacados puntuales. Nunca grandes áreas.

### Neutrales (ligeramente fríos, armonizan con el aqua)

| Token | HEX | Uso |
|-------|-----|-----|
| `--neutral-0` | `#FFFFFF` | Fondo base (light) |
| `--neutral-50` | `#F5F8F9` | Surface / fondo de sección |
| `--neutral-100` | `#EAEFF1` | Surface elevada / hover de filas |
| `--neutral-200` | `#D7E0E3` | Bordes |
| `--neutral-400` | `#94A6AC` | Texto deshabilitado / iconos sutiles |
| `--neutral-600` | `#5B7079` | Texto secundario |
| `--neutral-800` | `#23363D` | Texto principal |
| `--neutral-900` | `#0F2A33` | Títulos |

### Semánticos

| Token | HEX | Uso |
|-------|-----|-----|
| `--success` | `#16A34A` | Éxito / indexado / confirmado |
| `--warning` | `#F58220` | Advertencias (reusa el naranja de marca) |
| `--error` | `#DC2626` | Errores / destructivo |
| `--info` | `#008E97` | Informativo (reusa el aqua) |

---

## 3. Variables CSS (light + dark)

```css
:root {
  /* Marca */
  --brand-aqua: #008E97;
  --brand-aqua-700: #006E76;
  --brand-blue: #005778;
  --brand-blue-900: #003B52;
  --brand-orange: #F58220;
  --brand-orange-600: #D86E12;

  /* Superficies y texto (light) */
  --bg: #FFFFFF;
  --surface: #F5F8F9;
  --surface-elevated: #FFFFFF;
  --border: #D7E0E3;
  --text: #23363D;
  --text-muted: #5B7079;
  --text-heading: #0F2A33;

  /* Semánticos */
  --success: #16A34A;
  --warning: #F58220;
  --error: #DC2626;
  --info: #008E97;

  /* Primario derivado (botones) */
  --primary: var(--brand-aqua);
  --primary-hover: var(--brand-aqua-700);
  --primary-fg: #FFFFFF;

  /* Sombras */
  --shadow-sm: 0 1px 2px rgba(15, 42, 51, 0.06);
  --shadow-md: 0 4px 12px rgba(15, 42, 51, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 42, 51, 0.12);

  /* Radios */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-full: 9999px;
}

[data-theme="dark"] {
  --bg: #04161B;
  --surface: #0A2730;
  --surface-elevated: #0E323D;
  --border: #163945;
  --text: #DDE8EB;
  --text-muted: #8AA3AB;
  --text-heading: #F0F6F7;

  /* En dark el aqua se aclara un poco para contraste AA */
  --brand-aqua: #19A7B0;
  --primary: #19A7B0;
  --primary-hover: #43BCC4;
  --brand-orange: #FF9A3D;
  --warning: #FF9A3D;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.55);
}
```

> **Dark mode** se activa con `data-theme="dark"` en `<html>` (no
> `prefers-color-scheme`), para permitir toggle manual y persistirlo.

---

## 4. Tipografía

- **Familia UI:** `Inter` (con fallback a `system-ui, sans-serif`). Neutra,
  legible, profesional.
- **Números/montos:** Inter con `font-variant-numeric: tabular-nums` para que las
  cifras de los presupuestos alineen en columnas.
- **Escala:**

| Token | Tamaño / línea | Peso | Uso |
|-------|----------------|------|-----|
| `display` | 36 / 44 | 700 | Hero de landing |
| `h1` | 28 / 36 | 700 | Título de página |
| `h2` | 22 / 30 | 600 | Sección |
| `h3` | 18 / 26 | 600 | Subsección / card title |
| `body` | 15 / 24 | 400 | Texto base |
| `small` | 13 / 20 | 400 | Metadatos, captions |
| `mono` | 13 / 20 | 500 | IDs, montos en tablas técnicas |

---

## 5. Escala de espaciado

Base **4px**. Tokens: `4, 8, 12, 16, 24, 32, 48, 64`.
Padding de página: 24px (mobile) / 32px (desktop). Gap de cards: 16–24px.

---

## 6. Componentes base

| Componente | Especificación |
|------------|----------------|
| **Button / primary** | bg `--primary`, texto blanco, radio `--radius-md`, padding 10×16, hover `--primary-hover`, sombra `--shadow-sm` |
| **Button / secondary** | borde `--border`, texto `--text`, bg transparente, hover `--surface` |
| **Button / accent** | bg `--brand-orange`, texto blanco (CTAs destacados, uso puntual) |
| **Button / ghost** | sin borde, hover `--surface` |
| **Button / danger** | bg `--error`, texto blanco |
| **Input / Select / Textarea** | borde `--border`, radio `--radius-md`, focus ring 2px `--primary` con offset; placeholder `--text-muted` |
| **Card** | bg `--surface-elevated`, borde `--border`, radio `--radius-lg`, sombra `--shadow-sm`, padding 24 |
| **Modal** | overlay `rgba(15,42,51,.5)`, panel `--surface-elevated`, radio `--radius-lg`, sombra `--shadow-lg`, ancho máx 560 |
| **Badge** | radio `--radius-full`, padding 2×10, `small`; variantes success/warning/error/info con bg al 12% del color y texto al 100% |
| **Table** | header `--surface`, filas con borde inferior `--border`, hover `--neutral-100`, montos tabular alineados a la derecha |
| **Toast** | esquina sup-derecha, `--surface-elevated`, sombra `--shadow-md`, barra de color semántico a la izquierda |
| **Avatar** | círculo, fallback con iniciales sobre bg aqua |
| **Tabs** | indicador inferior 2px `--primary`; inactivos `--text-muted` |

---

## 7. Reglas de UX

- **Z-index (capas fijas):** base `0` · sticky header `10` · dropdown `20` ·
  overlay/modal `40` · toast `50` · tooltip `60`. No inventar valores fuera de esta
  escala; revisar antes de agregar.
- **Estados de carga:** usar **skeletons** que respetan el layout final (no
  spinners a pantalla completa). Botones en acción: spinner inline + disabled.
- **Estados vacíos:** ilustración/ícono + título + 1 frase + CTA primario
  (ej: "Todavía no subiste históricos · Subí tu primer PDF").
- **Errores:** inline junto al campo (forms) o toast `--error` (acciones). Nunca
  `alert()`. Mensajes accionables, no técnicos.
- **Foco accesible:** ring visible de 2px en todo elemento interactivo. Contraste
  mínimo AA (4.5:1 texto normal).
- **Mobile-first:** la navbar resuelve overflow con dropdown "Más", nunca con
  scroll horizontal. Modales full-screen en mobile.
- **Movimiento:** transiciones 150–200ms ease-out. Respetar
  `prefers-reduced-motion`.

---

## 8. Pendiente / evolución

- Definir set de iconos (sugerido: **Lucide**, coherente y liviano).
- Logo final (este es provisorio).
- Plantilla de documento (Word/PDF) que aplica branding del tenant —
  se detalla en Fase 3.
