import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, badRequest, notFound, requireTenantContext } from "@/lib/api";
import {
  deleteSession,
  getSession,
  updateSession,
  type ChatMessage,
} from "@/lib/generator-sessions";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/generador-sesiones/[id] — trae una sesión completa (verifica ownership). */
export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) return badRequest("Usuario no sincronizado.");
    const { id } = await params;
    const session = await getSession(tenant.id, user.id, id);
    if (!session) return notFound("Sesión no encontrada.");
    return NextResponse.json({ session });
  } catch (err) {
    return apiError(err);
  }
}

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const updateSchema = z.object({
  titulo: z.string().min(1).optional(),
  mensajes: z.array(messageSchema).optional(),
  borrador: z.unknown().nullish(),
});

/** PUT /api/generador-sesiones/[id] — actualización parcial (autosave de turnos siguientes). */
export async function PUT(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) return badRequest("Usuario no sincronizado.");
    const { id } = await params;
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos.");

    const ok = await updateSession({
      tenantId: tenant.id,
      userId: user.id,
      id,
      title: parsed.data.titulo,
      messages: parsed.data.mensajes as ChatMessage[] | undefined,
      draftContent: parsed.data.borrador ?? undefined,
    });
    if (!ok) return notFound("Sesión no encontrada.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

/** DELETE /api/generador-sesiones/[id] — borrado manual (verifica ownership). */
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) return badRequest("Usuario no sincronizado.");
    const { id } = await params;
    const ok = await deleteSession(tenant.id, user.id, id);
    if (!ok) return notFound("Sesión no encontrada.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
