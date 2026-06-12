import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { generateBudgetPayload } from "@/lib/ai/generation";
import { checkGenerationLimit } from "@/lib/billing/limits";
import { recordUsage } from "@/lib/ai/usage";
import { logAudit } from "@/lib/audit";

export const maxDuration = 120; // RAG + LLM

const bodySchema = z.object({
  prompt: z.string().min(10).max(5000),
  nivelDetalle: z.enum(["breve", "normal", "detallado"]).default("normal"),
});

/** Instrucción de formato que acompaña al pedido según el nivel elegido. */
const DETALLE_INSTRUCCION: Record<"breve" | "detallado", string> = {
  breve:
    "Formato: presupuesto compacto — pocas secciones, descripciones cortas, solo lo esencial.",
  detallado:
    "Formato: presupuesto exhaustivo — desglosá tareas, materiales, cantidades y condiciones con el máximo detalle razonable.",
};

/**
 * POST /api/generar — genera un presupuesto con IA (RAG + tool-calling) y lo
 * guarda como DRAFT. Devuelve el presupuesto para abrir el editor de bloques.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) {
      return badRequest(
        "Tu usuario todavía no está sincronizado. Probá de nuevo en unos segundos.",
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(
        "Contanos qué querés cotizar (mínimo 10 caracteres).",
      );
    }

    const limit = await checkGenerationLimit(tenant.id);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Alcanzaste el límite de tu plan (${limit.used}/${limit.limit} generaciones este mes). Mejorá tu plan para seguir generando.`,
        },
        { status: 429 },
      );
    }

    const profile = await prisma.companyProfile.findUnique({
      where: { tenantId: tenant.id },
    });

    // El nivel de detalle viaja como instrucción de formato; en la DB se guarda
    // solo el pedido original del usuario.
    const { prompt, nivelDetalle } = parsed.data;
    const promptParaIa =
      nivelDetalle === "normal"
        ? prompt
        : `${prompt}\n\n[${DETALLE_INSTRUCCION[nivelDetalle]}]`;

    const outcome = await generateBudgetPayload({
      tenant,
      profile,
      requestPrompt: promptParaIa,
    });

    const budget = await prisma.generatedBudget.create({
      data: {
        tenantId: tenant.id,
        createdById: user.id,
        title: outcome.payload.titulo,
        requestPrompt: prompt,
        content: outcome.payload,
        totalAmount: outcome.payload.cotizacionTotal,
        currency: outcome.payload.moneda,
        status: "DRAFT",
        ragSourceIds: outcome.rag.sourceIds,
      },
    });

    await recordUsage({
      tenantId: tenant.id,
      userId: user.id,
      operation: "GENERATION",
      provider: outcome.provider,
      model: outcome.model,
      usage: outcome.usage,
    });
    await logAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "BUDGET_GENERATED",
      payload: {
        budgetId: budget.id,
        ragMode: outcome.rag.mode,
        ragSourceIds: outcome.rag.sourceIds,
        provider: outcome.provider,
        model: outcome.model,
      },
    });

    return NextResponse.json(
      {
        budget: {
          id: budget.id,
          title: budget.title,
          totalAmount: outcome.payload.cotizacionTotal,
          currency: budget.currency,
          // Payload completo para abrir el editor embebido sin otro fetch.
          content: outcome.payload,
        },
        ragMode: outcome.rag.mode,
        sourceCount: outcome.rag.sourceIds.length,
        provider: outcome.provider,
        model: outcome.model,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err);
  }
}
