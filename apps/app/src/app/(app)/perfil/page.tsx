import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PerfilForm, type PerfilData } from "@/features/perfil/perfil-form";
import { parseSigners } from "@/types/signer";
import { z } from "zod";

export const dynamic = "force-dynamic";

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

export default async function PerfilPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para configurar el perfil.
      </p>
    );
  }

  const profile = await prisma.companyProfile.findUnique({
    where: { tenantId: tenant.id },
  });
  const companyData = companyDataSchema.safeParse(profile?.companyData ?? {});

  const data: PerfilData = {
    industry: profile?.industry ?? "",
    tone: profile?.tone ?? "",
    defaultUnits: profile?.defaultUnits ?? "",
    industryPrompt: profile?.industryPrompt ?? "",
    logoUrl: profile?.logoUrl ?? "",
    colorPrimary: profile?.colorPrimary ?? "",
    colorSecondary: profile?.colorSecondary ?? "",
    companyData: companyData.success ? companyData.data : {},
    signers: parseSigners(profile?.signers),
  };

  return <PerfilForm initial={data} tenantName={tenant.name} />;
}
