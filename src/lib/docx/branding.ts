import type { CompanyProfile, Tenant } from "@prisma/client";
import { z } from "zod";

/**
 * Branding por tenant para los documentos exportados (Fase 3).
 * A diferencia de ITZA (constantes hardcodeadas de una sola empresa), acá todo
 * sale de `CompanyProfile` y se inyecta al generar el documento.
 */

export interface DocumentBranding {
  companyName: string;
  /** Hex sin validar contra la paleta: es la marca DEL TENANT. */
  colorPrimary: string;
  colorSecondary: string;
  logoUrl: string | null;
  /** Líneas de contacto/razón social para el membrete. */
  companyLines: string[];
  locale: string;
}

const companyDataSchema = z
  .object({
    razonSocial: z.string().optional(),
    cuit: z.string().optional(),
    direccion: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().optional(),
    web: z.string().optional(),
  })
  .partial();

const DEFAULT_PRIMARY = "#005778"; // brand-blue de CotizaAI como fallback
const DEFAULT_SECONDARY = "#008e97";

export function buildBranding(
  tenant: Tenant,
  profile: CompanyProfile | null,
): DocumentBranding {
  const data = companyDataSchema.safeParse(profile?.companyData ?? {});
  const d = data.success ? data.data : {};
  const companyLines = [
    d.razonSocial,
    d.cuit ? `CUIT: ${d.cuit}` : undefined,
    d.direccion,
    [d.telefono, d.email, d.web].filter(Boolean).join(" · ") || undefined,
  ].filter((l): l is string => Boolean(l));

  return {
    companyName: d.razonSocial ?? tenant.name,
    colorPrimary: profile?.colorPrimary ?? DEFAULT_PRIMARY,
    colorSecondary: profile?.colorSecondary ?? DEFAULT_SECONDARY,
    logoUrl: profile?.logoUrl ?? null,
    companyLines,
    locale: tenant.locale,
  };
}

/** Descarga el logo (best-effort). Devuelve null si falla o no hay. */
export async function fetchLogo(
  branding: DocumentBranding,
): Promise<{ data: ArrayBuffer; type: "png" | "jpg" } | null> {
  if (!branding.logoUrl) return null;
  try {
    const res = await fetch(branding.logoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const type = contentType.includes("png")
      ? ("png" as const)
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? ("jpg" as const)
        : null;
    if (!type) return null;
    return { data: await res.arrayBuffer(), type };
  } catch {
    return null;
  }
}
