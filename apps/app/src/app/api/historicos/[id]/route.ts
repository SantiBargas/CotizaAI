import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  badRequest,
  notFound,
  requireTenantContext,
} from "@/lib/api";
import { deleteTenantFile } from "@/lib/storage";
import { structuredContentSchema } from "@/types/budget";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/historicos/[id] — detalle completo (para la pantalla de revisión). */
export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const budget = await prisma.historicalBudget.findFirst({
      where: { id, tenantId: tenant.id },
      include: { _count: { select: { chunks: true } } },
    });
    if (!budget) return notFound("Histórico no encontrado.");
    return NextResponse.json({ budget });
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  client: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  amount: z.number().nonnegative().nullish(),
  currency: z.string().length(3).optional(),
  documentDate: z.string().date().nullish(),
  rawText: z.string().max(200_000).nullish(),
  structuredContent: structuredContentSchema.nullish(),
  status: z.enum(["PENDING_REVIEW", "INDEXED", "ARCHIVED"]).optional(),
});

/** PATCH /api/historicos/[id] — edición durante la revisión humana. */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const existing = await prisma.historicalBudget.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!existing) return notFound("Histórico no encontrado.");

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos.");
    const d = parsed.data;

    const budget = await prisma.historicalBudget.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.client !== undefined && { client: d.client }),
        ...(d.location !== undefined && { location: d.location }),
        ...(d.amount !== undefined && { amount: d.amount }),
        ...(d.currency !== undefined && { currency: d.currency }),
        ...(d.documentDate !== undefined && {
          documentDate: d.documentDate ? new Date(d.documentDate) : null,
        }),
        ...(d.rawText !== undefined && { rawText: d.rawText }),
        ...(d.structuredContent !== undefined && {
          structuredContent: d.structuredContent ?? undefined,
        }),
        ...(d.status !== undefined && { status: d.status }),
      },
    });
    return NextResponse.json({ budget });
  } catch (err) {
    return apiError(err);
  }
}

/** DELETE /api/historicos/[id] — borra histórico + chunks + PDF del storage. */
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const budget = await prisma.historicalBudget.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true, sourceFileUrl: true },
    });
    if (!budget) return notFound("Histórico no encontrado.");

    await prisma.historicalBudget.delete({ where: { id: budget.id } });
    if (budget.sourceFileUrl) {
      try {
        await deleteTenantFile(budget.sourceFileUrl);
      } catch (err) {
        console.warn("No se pudo borrar el PDF del storage:", err);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
