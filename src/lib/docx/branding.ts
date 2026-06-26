import type { CompanyProfile, Tenant } from "@prisma/client";
import { z } from "zod";
import { parseSigners, type Signer } from "@/types/signer";
import type { BudgetTemplateConfig } from "@/types/budget-template";

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
  /** Firmantes a insertar al final del documento (la IA nunca genera firmas). */
  signers: Signer[];
  /** Prefijo antes del título del documento (formato/plantilla elegida). */
  documentTitlePrefix: string;
  /** Nota libre debajo del membrete (formato/plantilla elegida). */
  headerNote: string | null;
  /** Pie de página (formato/plantilla elegida). */
  footerText: string;
  totalLabel: string;
  paymentLabel: string;
  validityLabel: string;
  showLogo: boolean;
  showSignatures: boolean;
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
  template?: BudgetTemplateConfig,
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
    colorPrimary:
      template?.colorPrimary ?? profile?.colorPrimary ?? DEFAULT_PRIMARY,
    colorSecondary:
      template?.colorSecondary ?? profile?.colorSecondary ?? DEFAULT_SECONDARY,
    logoUrl: profile?.logoUrl ?? null,
    companyLines,
    locale: tenant.locale,
    signers: parseSigners(profile?.signers),
    documentTitlePrefix: template?.documentTitlePrefix ?? "",
    headerNote: template?.headerNote ?? null,
    footerText: template?.footerText ?? "Generado con CotizaAI",
    totalLabel: template?.totalLabel ?? "Total cotizado",
    paymentLabel: template?.paymentLabel ?? "Forma de pago",
    validityLabel: template?.validityLabel ?? "Validez de la oferta",
    showLogo: template?.showLogo ?? true,
    showSignatures: template?.showSignatures ?? true,
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
