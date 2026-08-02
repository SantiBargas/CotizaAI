import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { chatCompletion, AiNotConfiguredError } from "@/lib/ai/providers";
import { recordUsage } from "@/lib/ai/usage";

export const maxDuration = 60;

const bodySchema = z.object({
  contexto: z.string().min(20).max(4000),
});

const SYSTEM = `Sos un consultor experto en presupuestos y cotizaciones comerciales.
El usuario te describe su empresa y vos generás el "perfil del rubro": un prompt de sistema
que después usará una IA para redactar los presupuestos de esa empresa.

El prompt que generes debe estar en español, dirigido a la IA redactora (segunda persona),
y debe ser COMPLETO y DETALLADO, con esta estructura:

1. QUIÉNES SOMOS: rubro, tipo de clientes, zona de trabajo.
2. QUÉ INCLUYE UN PRESUPUESTO TÍPICO: secciones obligatorias y su orden.
3. CÓMO DESGLOSAR LOS ÍTEMS: unidades de medida, nivel de detalle de materiales/mano de obra,
   cómo agrupar partidas, qué va en tabla y qué en texto.
4. REGLAS DE PRECIOS: moneda, si se muestran subtotales, IVA/impuestos, redondeos, descuentos.
5. CONDICIONES COMERCIALES QUE NUNCA FALTAN: forma de pago, validez, plazos de entrega,
   garantías, qué NO incluye el trabajo (exclusiones típicas del rubro).
6. TONO Y ESTILO: formalidad, tecnicismos permitidos, longitud.
7. PROHIBICIONES: qué no debe inventar nunca (precios sin referencia, datos del cliente,
   firmas, datos bancarios).

Respondé SOLO con el prompt listo para guardar, sin preámbulos ni explicaciones.`;

/**
 * POST /api/perfil/generar-prompt — genera un industryPrompt completo a partir
 * de una descripción breve de la empresa, usando el perfil ya cargado como
 * contexto adicional.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(
        "Contanos un poco más sobre tu empresa (mínimo 20 caracteres).",
      );
    }

    const profile = await prisma.companyProfile.findUnique({
      where: { tenantId: tenant.id },
      select: { industry: true, tone: true, defaultUnits: true },
    });

    const contextoPerfil = [
      profile?.industry ? `Rubro declarado: ${profile.industry}` : null,
      profile?.tone ? `Tono preferido: ${profile.tone}` : null,
      profile?.defaultUnits
        ? `Unidades habituales: ${profile.defaultUnits}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await chatCompletion([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Empresa: ${tenant.name}\n${contextoPerfil ? `${contextoPerfil}\n` : ""}\nDescripción del dueño:\n${parsed.data.contexto}`,
      },
    ]);

    if (!result.text.trim()) {
      return NextResponse.json(
        { error: "La IA no devolvió contenido. Probá de nuevo." },
        { status: 502 },
      );
    }

    await recordUsage({
      tenantId: tenant.id,
      userId: user?.id,
      operation: "GENERATION",
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });

    return NextResponse.json({ prompt: result.text.trim() });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return apiError(err);
  }
}
