import { z } from "zod";

/**
 * Contrato IA ↔ App: bloques tipados del cuerpo de un presupuesto.
 * Es genérico para cualquier rubro. Se valida SIEMPRE con Zod (la IA responde
 * vía tool-calling, pero igual validamos el payload del tool).
 */

export const budgetBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("titulo"),
    texto: z.string(),
  }),
  z.object({
    type: z.literal("subtitulo"),
    texto: z.string(),
  }),
  z.object({
    type: z.literal("parrafo"),
    texto: z.string(),
  }),
  z.object({
    type: z.literal("lista"),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal("tabla"),
    encabezados: z.array(z.string()),
    filas: z.array(z.array(z.string())),
  }),
]);

export type BudgetBlock = z.infer<typeof budgetBlockSchema>;

/** Payload completo que el LLM entrega vía tool-calling. */
export const generatedBudgetPayloadSchema = z.object({
  titulo: z.string(),
  cotizacionTotal: z.number().nullable(),
  moneda: z.string().default("ARS"),
  formaPago: z.string().nullable(),
  validezDias: z.number().int().nullable(),
  cuerpo: z.array(budgetBlockSchema),
});

export type GeneratedBudgetPayload = z.infer<
  typeof generatedBudgetPayloadSchema
>;

/**
 * "Cajitas semánticas" extraídas de un PDF histórico (Fase 1).
 * Evitan inyectar el PDF crudo al prompt del generador (ahorro de tokens).
 */
export const structuredContentSchema = z.object({
  resumen: z.string().nullable(),
  condicionesComerciales: z.array(z.string()),
  entregables: z.array(z.string()),
  productosEquipos: z.array(z.string()),
  tareasDetalladas: z.array(z.string()),
});

export type StructuredContent = z.infer<typeof structuredContentSchema>;

/** Metadata que la IA infiere del PDF al extraer (para pre-llenar el form). */
export const extractedMetadataSchema = z.object({
  titulo: z.string().nullable(),
  cliente: z.string().nullable(),
  ubicacion: z.string().nullable(),
  montoTotal: z.number().nullable(),
  moneda: z.string().nullable(),
  fechaDocumento: z.string().nullable(), // ISO yyyy-mm-dd si se pudo inferir
});

export type ExtractedMetadata = z.infer<typeof extractedMetadataSchema>;
