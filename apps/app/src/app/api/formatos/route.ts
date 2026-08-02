import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import { budgetTemplateInputSchema } from "@/types/budget-template";

/**
 * GET /api/formatos — lista las plantillas de formato del tenant.
 * POST /api/formatos — crea una nueva plantilla. Si `isDefault` es true,
 * desmarca cualquier otra plantilla default del tenant (solo puede haber una).
 */

export async function GET(): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const templates = await prisma.budgetTemplate.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ templates });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const body = await req.json();
    const parsed = budgetTemplateInputSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Datos de plantilla inválidos.");
    }
    const { name, description, isDefault, config } = parsed.data;

    const template = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.budgetTemplate.updateMany({
          where: { tenantId: tenant.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.budgetTemplate.create({
        data: {
          tenantId: tenant.id,
          name,
          description,
          isDefault: isDefault ?? false,
          config,
        },
      });
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
