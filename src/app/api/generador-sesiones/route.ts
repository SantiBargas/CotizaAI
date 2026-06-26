import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import {
  createSession,
  listSessions,
  type ChatMessage,
} from "@/lib/generator-sessions";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const createSchema = z.object({
  titulo: z.string().min(1),
  mensajes: z.array(messageSchema),
  borrador: z.unknown().nullish(),
});

/** GET /api/generador-sesiones — lista las sesiones del usuario en este tenant. */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) return NextResponse.json({ sessions: [] });
    const sessions = await listSessions(tenant.id, user.id);
    return NextResponse.json({ sessions });
  } catch (err) {
    return apiError(err);
  }
}

/** POST /api/generador-sesiones — crea una sesión (autosave del primer turno). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();
    if (!user) return badRequest("Usuario no sincronizado.");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos.");

    const { id } = await createSession({
      tenantId: tenant.id,
      userId: user.id,
      title: parsed.data.titulo,
      messages: parsed.data.mensajes as ChatMessage[],
      draftContent: parsed.data.borrador ?? undefined,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
