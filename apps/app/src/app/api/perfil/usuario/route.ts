import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";

const putSchema = z.object({
  displayName: z.string().trim().max(80).nullish(),
});

/** PUT /api/perfil/usuario — nombre para mostrar del usuario actual (personal,
 *  no confundir con el perfil de empresa de /api/perfil). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireTenantContext();
    if (!user) return badRequest("Usuario no encontrado.");

    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Nombre inválido.");

    await prisma.user.update({
      where: { id: user.id },
      data: { displayName: parsed.data.displayName || null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
