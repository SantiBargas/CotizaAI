import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";

/** GET /api/historicos — lista de históricos del tenant. */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const budgets = await prisma.historicalBudget.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        client: true,
        location: true,
        amount: true,
        currency: true,
        documentDate: true,
        sourceFileName: true,
        status: true,
        createdByAI: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
    return NextResponse.json({ budgets });
  } catch (err) {
    return apiError(err);
  }
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  client: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  amount: z.number().nonnegative().nullish(),
  currency: z.string().length(3).default("ARS"),
  documentDate: z.string().date().nullish(),
  rawText: z.string().max(200_000).nullish(),
});

/** POST /api/historicos — alta manual (sin PDF). Queda PENDING_REVIEW. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant } = await requireTenantContext();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest("Datos inválidos: revisá los campos del formulario.");
    }
    const data = parsed.data;
    const budget = await prisma.historicalBudget.create({
      data: {
        tenantId: tenant.id,
        title: data.title,
        client: data.client ?? null,
        location: data.location ?? null,
        amount: data.amount ?? null,
        currency: data.currency,
        documentDate: data.documentDate ? new Date(data.documentDate) : null,
        rawText: data.rawText ?? null,
        createdByAI: false,
      },
    });
    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
