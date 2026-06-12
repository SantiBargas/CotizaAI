# Fase 3 — Export de documentos (Word + PDF con branding por tenant)

> Hito completado el 2026-06-10. Los presupuestos generados se exportan a
> `.docx` y `.pdf` con el branding de cada empresa, desde el editor de bloques.

## Endpoint

```
GET /api/presupuestos/[id]/export?formato=docx|pdf
```
[route.ts](../src/app/api/presupuestos/%5Bid%5D/export/route.ts) — busca el
presupuesto **scopeado por tenant**, valida el contenido con Zod, arma el
branding desde `CompanyProfile` y descarga el archivo
(`Content-Disposition: attachment`, nombre slugificado).

## Branding por tenant — [src/lib/docx/branding.ts](../src/lib/docx/branding.ts)

A diferencia de ITZA (membrete hardcodeado de una empresa), acá todo es del
tenant:

- `colorPrimary` / `colorSecondary` (hex del `CompanyProfile`; fallback paleta
  CotizaAI).
- `logoUrl` → `fetchLogo()` best-effort (png/jpg; si falla, documento sin logo).
- `companyData` (Json) → líneas de membrete: razón social, CUIT, dirección,
  contacto. Parseado tolerante con Zod (`.partial()`).
- `locale` del tenant para formato de fechas y montos.

## Word — [src/lib/docx/budget-docx.ts](../src/lib/docx/budget-docx.ts)

- Librería `docx` (estable, server-side, `Packer.toBuffer`).
- Estructura: membrete (logo + nombre + contacto + regla de color) → título +
  fecha → cuerpo desde los **bloques tipados** → resumen comercial (total
  destacado en color primario, forma de pago, validez).
- Mapeo de bloques: `titulo`→Heading1 color primario · `subtitulo`→Heading2
  color secundario · `parrafo` justificado · `lista` con bullets · `tabla` con
  header con fondo del color primario y texto blanco.
- **Sin bloques de firma** (regla heredada de ITZA: la firma la pone la
  empresa, nunca el LLM).

## PDF — [src/lib/pdf/budget-pdf.tsx](../src/lib/pdf/budget-pdf.tsx)

- `@react-pdf/renderer` server-side (`renderToBuffer`), A4, Helvetica.
- Mismo contenido y jerarquía visual que el Word (colores del tenant en
  títulos, tablas y total). Footer fijo "Generado con CotizaAI".
- Mejora sobre ITZA: allí el flujo era `.docx` → Google Docs → exportar PDF a
  mano; acá el PDF sale directo (muchos rubros no usan Word).

## UI

Los botones **Word** y **PDF** ya estaban en el editor de bloques
([budget-editor.tsx](../src/features/presupuestos/budget-editor.tsx)) y apuntan
a este endpoint. Funcionan tanto en DRAFT como en FINAL (para previsualizar).
