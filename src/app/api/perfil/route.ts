import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { signersSchema } from "@/types/signer";

/** GET /api/perfil — CompanyProfile del tenant (o null si no existe aún). */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const profile = await prisma.companyProfile.findUnique({
      where: { tenantId: tenant.id },
    });
    return NextResponse.json({ profile });
  } catch (err) {
    return apiError(err);
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const putSchema = z.object({
  industry: z.string().max(120).nullish(),
  tone: z.string().max(200).nullish(),
  defaultUnits: z.string().max(200).nullish(),
  industryPrompt: z.string().max(8000).nullish(),
  logoUrl: z.string().url().max(500).nullish().or(z.literal("").transform(() => null)),
  colorPrimary: z.string().regex(HEX_RE).nullish().or(z.literal("").transform(() => null)),
  colorSecondary: z.string().regex(HEX_RE).nullish().or(z.literal("").transform(() => null)),
  companyData: z
    .object({
      razonSocial: z.string().max(200).optional(),
      cuit: z.string().max(20).optional(),
      direccion: z.string().max(300).optional(),
      telefono: z.string().max(50).optional(),
      email: z.string().max(200).optional(),
      web: z.string().max(200).optional(),
    })
    .nullish(),
  signers: signersSchema.nullish(),
});

/** PUT /api/perfil — upsert del perfil de empresa (rubro + branding). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos en el perfil.");
    const d = parsed.data;

    const data = {
      industry: d.industry ?? null,
      tone: d.tone ?? null,
      defaultUnits: d.defaultUnits ?? null,
      industryPrompt: d.industryPrompt ?? null,
      logoUrl: d.logoUrl ?? null,
      colorPrimary: d.colorPrimary ?? null,
      colorSecondary: d.colorSecondary ?? null,
      companyData: d.companyData ?? undefined,
      signers: d.signers ?? undefined,
    };

    const profile = await prisma.companyProfile.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...data },
      update: data,
    });

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "PROFILE_UPDATED",
    });

    return NextResponse.json({ profile });
  } catch (err) {
    return apiError(err);
  }
}
