import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, notFound, requireTenantContext } from "@/lib/api";
import { getSignedUrl } from "@/lib/storage";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/historicos/[id]/archivo — redirige a URL firmada del PDF original. */
export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const budget = await prisma.historicalBudget.findFirst({
      where: { id, tenantId: tenant.id },
      select: { sourceFileUrl: true },
    });
    if (!budget?.sourceFileUrl) {
      return notFound("Este histórico no tiene PDF original guardado.");
    }
    const url = await getSignedUrl(budget.sourceFileUrl);
    return NextResponse.redirect(url);
  } catch (err) {
    return apiError(err);
  }
}
