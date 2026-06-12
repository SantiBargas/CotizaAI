import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import {
  getAccessToken,
  downloadFile,
  DriveNotConfiguredError,
  DriveNotConnectedError,
} from "@/lib/integrations/google-drive";
import { ingestPdfHistorical, EmptyPdfTextError } from "@/lib/pdf/ingest";
import { checkHistoricalLimit } from "@/lib/billing/limits";

export const maxDuration = 120; // descarga + extracción + LLM pueden tardar

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB (mismo límite que el upload)

const bodySchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1).max(300),
});

/**
 * POST /api/historicos/import-drive — descarga un PDF del Google Drive del
 * tenant y lo mete en el mismo pipeline de ingesta que el upload manual.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();

    const limit = await checkHistoricalLimit(tenant.id);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Alcanzaste el límite de históricos de tu plan (${limit.used}/${limit.limit}). Archivá alguno o mejorá tu plan.`,
        },
        { status: 429 },
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Datos inválidos.");
    const { fileId, fileName } = parsed.data;

    const accessToken = await getAccessToken(tenant.id);
    const buffer = await downloadFile(accessToken, fileId);
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return badRequest("El PDF supera el máximo de 15 MB.");
    }

    const budget = await ingestPdfHistorical({
      tenant,
      user,
      fileName: fileName.toLowerCase().endsWith(".pdf")
        ? fileName
        : `${fileName}.pdf`,
      buffer,
      source: "google-drive",
    });

    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyPdfTextError) return badRequest(err.message);
    if (
      err instanceof DriveNotConfiguredError ||
      err instanceof DriveNotConnectedError
    ) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return apiError(err);
  }
}
