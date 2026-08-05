import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireTenantRole } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  getAccessToken,
  listFolderChildren,
  DriveNotConfiguredError,
  DriveNotConnectedError,
} from "@/lib/integrations/google-drive";

/**
 * GET /api/integrations/google/folder-children?folderId=root&pageToken=...
 * Navegación en árbol de Drive para /basedatos/presupuestos (solo
 * OWNER/ADMIN). Cada PDF devuelto trae `imported`/`historicalBudgetId` si ya
 * fue cargado a HistoricalBudget (cruce por driveFileId).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantRole(["OWNER", "ADMIN"]);
    const folderId = req.nextUrl.searchParams.get("folderId") || "root";
    const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;

    const accessToken = await getAccessToken(tenant.id);
    const { folders, files, nextPageToken } = await listFolderChildren(
      accessToken,
      folderId,
      { pageToken },
    );

    const imported = files.length
      ? await prisma.historicalBudget.findMany({
          where: {
            tenantId: tenant.id,
            driveFileId: { in: files.map((f) => f.id) },
          },
          select: { id: true, driveFileId: true },
        })
      : [];
    const importedByFileId = new Map(
      imported.map((b) => [b.driveFileId, b.id]),
    );

    return NextResponse.json({
      folders,
      files: files.map((f) => ({
        ...f,
        imported: importedByFileId.has(f.id),
        historicalBudgetId: importedByFileId.get(f.id) ?? null,
      })),
      nextPageToken,
    });
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
