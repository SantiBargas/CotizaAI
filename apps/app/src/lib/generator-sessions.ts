import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Historial de sesiones del generador (sidebar tipo ChatGPT/Claude). Todo
 * scopeado a tenantId + userId de la sesión — nunca confiar en un id de
 * sesión sin verificar ownership antes de leer/escribir.
 */

const MAX_MESSAGES = 40;
const STALE_DAYS = 90;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Limpieza perezosa: borra sesiones de este tenant con +90 días sin actividad. */
async function cleanupStaleSessions(tenantId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  await prisma.generatorSession
    .deleteMany({ where: { tenantId, updatedAt: { lt: cutoff } } })
    .catch(() => undefined); // best-effort, nunca bloquea el listado
}

export async function listSessions(
  tenantId: string,
  userId: string,
): Promise<SessionSummary[]> {
  await cleanupStaleSessions(tenantId);
  const rows = await prisma.generatorSession.findMany({
    where: { tenantId, userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getSession(
  tenantId: string,
  userId: string,
  id: string,
): Promise<{
  id: string;
  title: string;
  messages: ChatMessage[];
  draftContent: Prisma.JsonValue | null;
} | null> {
  const row = await prisma.generatorSession.findFirst({
    where: { id, tenantId, userId },
  });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    messages: (row.messages as unknown as ChatMessage[]) ?? [],
    draftContent: row.draftContent,
  };
}

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > MAX_MESSAGES
    ? messages.slice(messages.length - MAX_MESSAGES)
    : messages;
}

export async function createSession(params: {
  tenantId: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  draftContent?: Prisma.InputJsonValue | null;
}): Promise<{ id: string }> {
  const row = await prisma.generatorSession.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      title: params.title.slice(0, 120),
      messages: trimMessages(params.messages) as unknown as Prisma.InputJsonValue,
      draftContent: params.draftContent ?? undefined,
    },
    select: { id: true },
  });
  return row;
}

export async function updateSession(params: {
  tenantId: string;
  userId: string;
  id: string;
  title?: string;
  messages?: ChatMessage[];
  draftContent?: Prisma.InputJsonValue | null;
}): Promise<boolean> {
  const result = await prisma.generatorSession.updateMany({
    where: { id: params.id, tenantId: params.tenantId, userId: params.userId },
    data: {
      ...(params.title !== undefined && { title: params.title.slice(0, 120) }),
      ...(params.messages !== undefined && {
        messages: trimMessages(params.messages) as unknown as Prisma.InputJsonValue,
      }),
      ...(params.draftContent !== undefined && {
        draftContent: params.draftContent ?? undefined,
      }),
    },
  });
  return result.count > 0;
}

export async function deleteSession(
  tenantId: string,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.generatorSession.deleteMany({
    where: { id, tenantId, userId },
  });
  return result.count > 0;
}
