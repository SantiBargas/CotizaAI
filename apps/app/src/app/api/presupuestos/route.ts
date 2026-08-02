import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { generatedBudgetPayloadSchema } from "@/types/budget";

const createSchema = z.object({
  content: generatedBudgetPayloadSchema,
});

/**
 * POST /api/presupuestos — crea un presupuesto DRAFT a partir de un payload ya
 * armado (importación de JSON externo, sin pasar por la IA ni gastar tokens).
 * El contenido se valida con el mismo schema Zod del contrato IA ↔ App.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) return badRequest("Usuario no sincronizado. Reingresá e intentá de nuevo.");

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(
        "El JSON no cumple el contrato de presupuesto (revisá bloques y campos).",
      );
    }
    const content = parsed.data.content;

    const budget = await prisma.generatedBudget.create({
      data: {
        tenantId: tenant.id,
        createdById: user.id,
        title: content.titulo || "Presupuesto importado",
        requestPrompt: "(importado desde JSON externo)",
        content,
        totalAmount: content.cotizacionTotal,
        currency: content.moneda,
        status: "DRAFT",
        ragSourceIds: [],
      },
    });
    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
