import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  badRequest,
  notFound,
  requireTenantContext,
} from "@/lib/api";
import { budgetTemplateInputSchema } from "@/types/budget-template";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET/PUT/DELETE /api/formatos/[id] — gestión individual de una plantilla de
 * formato. PUT con `isDefault: true` desmarca las demás plantillas default.
 */

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const template = await prisma.budgetTemplate.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!template) return notFound("Plantilla no encontrada.");
    return NextResponse.json({ template });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const existing = await prisma.budgetTemplate.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) return notFound("Plantilla no encontrada.");

    const body = await req.json();
    const parsed = budgetTemplateInputSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos de plantilla inválidos.");
    }
    const { name, description, isDefault, config } = parsed.data;

    const template = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.budgetTemplate.updateMany({
          where: { tenantId: tenant.id, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.budgetTemplate.update({
        where: { id },
        data: {
          name,
          description,
          isDefault: isDefault ?? false,
          config,
        },
      });
    });

    return NextResponse.json({ template });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const existing = await prisma.budgetTemplate.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) return notFound("Plantilla no encontrada.");

    await prisma.budgetTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
