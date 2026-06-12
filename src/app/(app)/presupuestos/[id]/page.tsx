import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { generatedBudgetPayloadSchema } from "@/types/budget";
import { BudgetEditor } from "@/features/presupuestos/budget-editor";
import type { GeneratedBudgetDetail } from "@/features/presupuestos/types";

export const dynamic = "force-dynamic";

export default async function PresupuestoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const { id } = await params;
  const b = await prisma.generatedBudget.findFirst({
    where: { id, tenantId: tenant.id },
  });
  if (!b) notFound();

  const content = generatedBudgetPayloadSchema.safeParse(b.content);
  if (!content.success) notFound();

  const budget: GeneratedBudgetDetail = {
    id: b.id,
    title: b.title,
    totalAmount: b.totalAmount === null ? null : Number(b.totalAmount),
    currency: b.currency,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    requestPrompt: b.requestPrompt,
    content: content.data,
    ragSourceIds: b.ragSourceIds,
  };

  return <BudgetEditor budget={budget} />;
}
