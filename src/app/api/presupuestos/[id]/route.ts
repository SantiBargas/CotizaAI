import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  badRequest,
  notFound,
  requireTenantContext,
} from "@/lib/api";
import { generatedBudgetPayloadSchema } from "@/types/budget";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/presupuestos/[id] — detalle de un presupuesto generado. */
export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const budget = await prisma.generatedBudget.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!budget) return notFound("Presupuesto no encontrado.");
    return NextResponse.json({ budget });
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  content: generatedBudgetPayloadSchema.optional(),
  status: z.enum(["DRAFT", "FINAL"]).optional(),
});

/** PATCH /api/presupuestos/[id] — guarda ediciones del editor de bloques. */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const existing = await prisma.generatedBudget.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!existing) return notFound("Presupuesto no encontrado.");

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos.");
    const d = parsed.data;

    const budget = await prisma.generatedBudget.update({
      where: { id },
      data: {
        ...(d.content !== undefined && {
          content: d.content,
          title: d.content.titulo,
          totalAmount: d.content.cotizacionTotal,
          currency: d.content.moneda,
        }),
        ...(d.status !== undefined && { status: d.status }),
      },
    });
    return NextResponse.json({ budget });
  } catch (err) {
    return apiError(err);
  }
}

/** DELETE /api/presupuestos/[id] — elimina un presupuesto generado. */
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const existing = await prisma.generatedBudget.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!existing) return notFound("Presupuesto no encontrado.");
    await prisma.generatedBudget.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
