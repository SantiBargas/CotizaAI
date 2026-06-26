import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

/**
 * GET /api/cron/keep-alive — pingeado por Vercel Cron (ver vercel.json) para
 * que Supabase free tier no pause el proyecto por inactividad. Un SELECT
 * trivial alcanza; no toca tablas de negocio.
 *
 * Vercel firma el request con `Authorization: Bearer ${CRON_SECRET}`; si el
 * secret no coincide (o no está configurado), se rechaza.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  if (env.CRON_SECRET) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
