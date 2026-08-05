import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, notFound, requireTenantContext } from "@/lib/api";
import { generateBudgetPayload } from "@/lib/ai/generation";
import { availableProvidersForTenant, isProviderId } from "@/lib/ai/providers";
import { checkGenerationLimit } from "@/lib/billing/limits";
import { recordUsage } from "@/lib/ai/usage";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { generatedBudgetPayloadSchema } from "@/types/budget";

export const maxDuration = 120; // RAG + LLM

const bodySchema = z.object({
  prompt: z.string().min(10).max(5000),
  nivelDetalle: z.enum(["breve", "normal", "detallado"]).default("normal"),
  /** Proveedor de IA elegido por el usuario en el composer (opcional). */
  provider: z.string().optional(),
  /** Si viene, el pedido es un cambio sobre este presupuesto (mismo hilo de
   *  chat) en vez de una generación nueva — se edita in-place. */
  budgetId: z.string().uuid().optional(),
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

    const rateLimit = checkRateLimit(`generar:${tenant.id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Estás generando presupuestos muy rápido. Esperá un momento antes de volver a intentar.",
        },
        { status: 429 },
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
    const { prompt, nivelDetalle, provider, budgetId } = parsed.data;
    const promptParaIa =
      nivelDetalle === "normal"
        ? prompt
        : `${prompt}\n\n[${DETALLE_INSTRUCCION[nivelDetalle]}]`;

    if (provider) {
      if (!isProviderId(provider)) {
        return badRequest("Proveedor de IA inválido.");
      }
      const allowed = await availableProvidersForTenant(tenant.id);
      if (!allowed.includes(provider)) {
        return badRequest("Ese proveedor de IA no está disponible para tu cuenta.");
      }
    }

    // Modo edición: el pedido es un cambio sobre un presupuesto ya generado
    // en este mismo hilo de chat — le pasamos su contenido actual a la IA
    // para que devuelva la versión completa actualizada, y actualizamos esa
    // misma fila en vez de crear una nueva.
    let existing: { id: string; content: unknown } | null = null;
    if (budgetId) {
      existing = await prisma.generatedBudget.findFirst({
        where: { id: budgetId, tenantId: tenant.id },
        select: { id: true, content: true },
      });
      if (!existing) return notFound("Presupuesto no encontrado.");
    }
    const currentContent = existing
      ? generatedBudgetPayloadSchema.parse(existing.content)
      : undefined;

    const outcome = await generateBudgetPayload({
      tenant,
      profile,
      requestPrompt: promptParaIa,
      provider: provider && isProviderId(provider) ? provider : undefined,
      currentContent,
    });

    const budget = existing
      ? await prisma.generatedBudget.update({
          where: { id: existing.id },
          data: {
            title: outcome.payload.titulo,
            content: outcome.payload,
            totalAmount: outcome.payload.cotizacionTotal,
            currency: outcome.payload.moneda,
            ragSourceIds: outcome.rag.sourceIds,
          },
        })
      : await prisma.generatedBudget.create({
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
      action: existing ? "BUDGET_EDITED" : "BUDGET_GENERATED",
      payload: {
        budgetId: budget.id,
        ragMode: outcome.rag.mode,
        ragSourceIds: outcome.rag.sourceIds,
        provider: outcome.provider,
        model: outcome.model,
      },
    });

    revalidatePath("/presupuestos");
    revalidatePath("/dashboard");
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
      { status: existing ? 200 : 201 },
    );
  } catch (err) {
    return apiError(err);
  }
}
