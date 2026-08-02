import { z } from "zod";

/**
 * Firmantes de los documentos del tenant (regla heredada de ITZA: la IA NUNCA
 * genera firmas — estas se cargan en /perfil y se insertan al exportar).
 * La imagen viaja como data URL (png/jpeg) con sus dimensiones reales para
 * escalar sin deformar en Word/PDF.
 */

export const signerFirmaSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,/)
    .max(400_000), // ~300 KB de imagen
  width: z.number().int().min(10).max(4000),
  height: z.number().int().min(10).max(4000),
});

export const signerSchema = z.object({
  id: z.string().min(1).max(60),
  nombre: z.string().min(1).max(120),
  cargo: z.string().max(120).nullable(),
  firma: signerFirmaSchema.nullable(),
});

export const signersSchema = z.array(signerSchema).max(6);

export type SignerFirma = z.infer<typeof signerFirmaSchema>;
export type Signer = z.infer<typeof signerSchema>;

/** Parse tolerante del Json de la DB: si no valida, lista vacía. */
export function parseSigners(value: unknown): Signer[] {
  const parsed = signersSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

/** Escala la firma a un alto máximo manteniendo proporción (para export). */
export function scaleFirma(
  firma: SignerFirma,
  maxHeight: number,
  maxWidth: number,
): { width: number; height: number } {
  const ratio = Math.min(
    maxHeight / firma.height,
    maxWidth / firma.width,
    1,
  );
  return {
    width: Math.round(firma.width * ratio),
    height: Math.round(firma.height * ratio),
  };
}
