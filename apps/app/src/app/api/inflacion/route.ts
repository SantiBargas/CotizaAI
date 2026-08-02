import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireTenantContext } from "@/lib/api";

/**
 * GET /api/inflacion?country=AR&currency=ARS — índices cargados (los índices
 * son globales, pero igual exigimos sesión con tenant).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country") ?? "AR";
    const currency = searchParams.get("currency") ?? "ARS";
    const indices = await prisma.inflationIndex.findMany({
      where: { country, currency },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 60,
    });
    return NextResponse.json({ indices });
  } catch (err) {
    return apiError(err);
  }
}
