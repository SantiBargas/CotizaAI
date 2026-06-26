import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, badRequest, requireTenantRole } from "@/lib/api";
import { isProviderId, pingProvider } from "@/lib/ai/providers";

/**
 * POST /api/configuracion/ia/ping — dispara una llamada real mínima a un
 * proveedor para confirmar conectividad. Solo a demanda explícita del
 * usuario (botón "Probar conexión"), nunca automático, y restringido a
 * OWNER/ADMIN porque consume cuota real del proveedor.
 */

const bodySchema = z.object({ provider: z.string() });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireTenantRole(["OWNER", "ADMIN"]);

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success || !isProviderId(parsed.data.provider)) {
      return badRequest("Proveedor inválido.");
    }

    const result = await pingProvider(parsed.data.provider);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
