import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiError,
  badRequest,
  notFound,
  requireTenantContext,
} from "@/lib/api";
import { generatedBudgetPayloadSchema } from "@/types/budget";
import { buildBranding } from "@/lib/docx/branding";
import { buildBudgetDocx } from "@/lib/docx/budget-docx";
import { buildBudgetPdf } from "@/lib/pdf/budget-pdf";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ id: string }> };

function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "presupuesto"
  );
}

/**
 * GET /api/presupuestos/[id]/export?formato=docx|pdf
 * Genera el documento con el branding del tenant y lo descarga.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const formato = searchParams.get("formato") ?? "docx";
    if (formato !== "docx" && formato !== "pdf") {
      return badRequest("Formato inválido: usar `docx` o `pdf`.");
    }

    const budget = await prisma.generatedBudget.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!budget) return notFound("Presupuesto no encontrado.");

    const parsed = generatedBudgetPayloadSchema.safeParse(budget.content);
    if (!parsed.success) {
      return badRequest("El contenido del presupuesto está corrupto.");
    }

    const profile = await prisma.companyProfile.findUnique({
      where: { tenantId: tenant.id },
    });
    const branding = buildBranding(tenant, profile);

    const buffer =
      formato === "docx"
        ? await buildBudgetDocx({
            payload: parsed.data,
            branding,
            createdAt: budget.createdAt,
          })
        : await buildBudgetPdf({
            payload: parsed.data,
            branding,
            createdAt: budget.createdAt,
          });

    const contentType =
      formato === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
    const fileName = `${fileSlug(budget.title)}.${formato}`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
