import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireTenantContext } from "@/lib/api";
import { findSuspiciousHistoricals } from "@/lib/historicals/audit";

/**
 * GET /api/historicos/audit — detecta históricos sospechosos del tenant
 * (duplicados, datos incompletos, extracción pobre, pendientes hace mucho).
 * Ver docs/tareas.md E.1.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const includeReviewed = req.nextUrl.searchParams.get("includeReviewed") === "1";
    const groups = await findSuspiciousHistoricals(tenant.id, { includeReviewed });
    return NextResponse.json({ groups });
  } catch (err) {
    return apiError(err);
  }
}
