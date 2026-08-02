import { NextResponse, type NextRequest } from "next/server";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { ingestPdfHistorical, EmptyPdfTextError } from "@/lib/pdf/ingest";
import { checkHistoricalLimit } from "@/lib/billing/limits";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 120; // extracción + LLM pueden tardar

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * POST /api/historicos/upload — multipart con un PDF.
 * Pipeline compartido en src/lib/pdf/ingest.ts (también usado por el import
 * desde Google Drive).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();

    const rateLimit = checkRateLimit(`historicos-upload:${tenant.id}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Estás subiendo históricos muy rápido. Esperá un momento antes de volver a intentar.",
        },
        { status: 429 },
      );
    }

    const limit = await checkHistoricalLimit(tenant.id);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: `Alcanzaste el límite de históricos de tu plan (${limit.used}/${limit.limit}). Archivá alguno o mejorá tu plan.`,
        },
        { status: 429 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return badRequest("Falta el archivo PDF (campo `file`).");
    }
    const ACCEPTED_TYPES = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const ACCEPTED_EXTENSIONS = /\.(pdf|docx|xlsx)$/i;
    if (
      !ACCEPTED_TYPES.includes(file.type) &&
      !ACCEPTED_EXTENSIONS.test(file.name)
    ) {
      return badRequest("Solo se aceptan archivos PDF, Word (.docx) o Excel (.xlsx).");
    }
    if (file.size > MAX_FILE_BYTES) {
      return badRequest("El archivo supera el máximo de 15 MB.");
    }

    const budget = await ingestPdfHistorical({
      tenant,
      user,
      fileName: file.name,
      buffer: await file.arrayBuffer(),
      source: "upload",
    });

    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyPdfTextError) return badRequest(err.message);
    return apiError(err);
  }
}
