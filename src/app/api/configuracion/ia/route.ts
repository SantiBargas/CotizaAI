import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext, requireTenantRole } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import {
  availableProviders,
  checkAllProvidersHealth,
  isProviderId,
} from "@/lib/ai/providers";

/**
 * GET /api/configuracion/ia — lectura de la config de IA del tenant (cualquier
 * miembro autenticado) + estado de salud (configurado/no-configurado) de cada
 * proveedor del catálogo.
 * PUT /api/configuracion/ia — actualiza proveedores habilitados y defaults de
 * chat/generación (solo OWNER/ADMIN). El tenantId SIEMPRE viene de la sesión.
 */

const bodySchema = z.object({
  enabledProviders: z.array(z.string()).default([]),
  defaultChat: z.string().nullable().optional(),
  defaultGeneration: z.string().nullable().optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const config = await prisma.tenantAiConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    return NextResponse.json({
      config: {
        enabledProviders: config?.enabledProviders ?? [],
        defaultChat: config?.defaultChat ?? null,
        defaultGeneration: config?.defaultGeneration ?? null,
      },
      health: checkAllProvidersHealth(),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantRole(["OWNER", "ADMIN"]);

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos de configuración inválidos.");

    const enabledProviders = parsed.data.enabledProviders.filter(isProviderId);
    const validProviders = new Set(availableProviders());

    // No permitir dejar 0 proveedores habilitados si la lista no estaba vacía
    // originalmente (mínimo 1, salvo que se quiera volver a "todos = vacío").
    if (
      parsed.data.enabledProviders.length > 0 &&
      enabledProviders.length === 0
    ) {
      return badRequest("Tenés que habilitar al menos un proveedor válido.");
    }

    const defaultChat =
      parsed.data.defaultChat && isProviderId(parsed.data.defaultChat)
        ? parsed.data.defaultChat
        : null;
    const defaultGeneration =
      parsed.data.defaultGeneration && isProviderId(parsed.data.defaultGeneration)
        ? parsed.data.defaultGeneration
        : null;

    // Si se especifica un default, tiene que estar dentro de los habilitados
    // (o de los disponibles, si no hay ninguno habilitado explícitamente).
    const effectivePool = enabledProviders.length > 0 ? enabledProviders : Array.from(validProviders);
    if (defaultChat && !effectivePool.includes(defaultChat)) {
      return badRequest("El proveedor de chat por defecto no está habilitado.");
    }
    if (defaultGeneration && !effectivePool.includes(defaultGeneration)) {
      return badRequest(
        "El proveedor de generación por defecto no está habilitado.",
      );
    }

    const config = await prisma.tenantAiConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        enabledProviders,
        defaultChat,
        defaultGeneration,
      },
      update: {
        enabledProviders,
        defaultChat,
        defaultGeneration,
      },
    });

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "AI_CONFIG_UPDATED",
      payload: {
        enabledProviders,
        defaultChat,
        defaultGeneration,
      },
    });

    return NextResponse.json({
      config: {
        enabledProviders: config.enabledProviders,
        defaultChat: config.defaultChat,
        defaultGeneration: config.defaultGeneration,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
