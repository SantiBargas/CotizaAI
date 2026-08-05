import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireTenantRole } from "@/lib/api";
import { findSuspiciousHistoricals } from "@/lib/historicals/audit";

/**
 * GET /api/historicos/audit — detecta históricos sospechosos del tenant
 * (duplicados, datos incompletos, extracción pobre, pendientes hace mucho).
 * Solo OWNER/ADMIN: vive en el panel de administración /basedatos/auditoria.
 * Ver docs/tareas.md E.1.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantRole(["OWNER", "ADMIN"]);
    const includeReviewed = req.nextUrl.searchParams.get("includeReviewed") === "1";
    const groups = await findSuspiciousHistoricals(tenant.id, { includeReviewed });
    return NextResponse.json({ groups });
  } catch (err) {
    return apiError(err);
  }
}
