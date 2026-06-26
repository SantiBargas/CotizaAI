import { z } from "zod";

/**
 * Configuración de un "prototipo" de formato de presupuesto (Fase 5+).
 * Se aplica al exportar Word/PDF, encima del branding del tenant
 * (`CompanyProfile`). Pensado para que alguien sin código pueda tener más de
 * un formato (ej: "Presupuesto estándar" vs. "Licitación").
 */
export const budgetTemplateConfigSchema = z.object({
  /** Prefijo antes del título del documento, ej: "LICITACIÓN — ". */
  documentTitlePrefix: z.string().max(60).optional(),
  /** Nota libre debajo del membrete (condiciones, aclaraciones legales...). */
  headerNote: z.string().max(2000).optional(),
  /** Texto del pie de página (reemplaza "Generado con CotizaAI" en el PDF). */
  footerText: z.string().max(300).optional(),
  /** Etiqueta para el total cotizado (default "Total cotizado"). */
  totalLabel: z.string().min(1).max(80).optional(),
  /** Etiqueta para la forma de pago (default "Forma de pago"). */
  paymentLabel: z.string().min(1).max(80).optional(),
  /** Etiqueta para la validez de la oferta (default "Validez de la oferta"). */
  validityLabel: z.string().min(1).max(80).optional(),
  /** Mostrar el logo del tenant en el membrete (default true). */
  showLogo: z.boolean().optional(),
  /** Insertar el bloque de firmas al cierre (default true). */
  showSignatures: z.boolean().optional(),
  /** Override del color primario del branding para este formato. */
  colorPrimary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  /** Override del color secundario del branding para este formato. */
  colorSecondary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export type BudgetTemplateConfig = z.infer<typeof budgetTemplateConfigSchema>;

/** Parser tolerante: si el JSON guardado no matchea más, devuelve `{}`. */
export function parseTemplateConfig(value: unknown): BudgetTemplateConfig {
  const parsed = budgetTemplateConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export const budgetTemplateInputSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  isDefault: z.boolean().optional(),
  config: budgetTemplateConfigSchema,
});
