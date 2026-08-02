import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireTenantContext } from "@/lib/api";
import {
  getAccessToken,
  listPdfs,
  DriveNotConfiguredError,
  DriveNotConnectedError,
} from "@/lib/integrations/google-drive";

/**
 * GET /api/integrations/google/files?q=...&pageToken=...
 * Lista los PDFs del Drive del tenant (más recientes primero).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const accessToken = await getAccessToken(tenant.id);
    const result = await listPdfs(accessToken, {
      query: req.nextUrl.searchParams.get("q") ?? undefined,
      pageToken: req.nextUrl.searchParams.get("pageToken") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (
      err instanceof DriveNotConfiguredError ||
      err instanceof DriveNotConnectedError
    ) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return apiError(err);
  }
}
