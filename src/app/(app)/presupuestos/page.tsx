import Link from "next/link";
import { FileText } from "lucide-react";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  Badge,
  Button,
  EmptyState,
  Table,
  TD,
  TH,
  THead,
  TRow,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import {
  BUDGET_STATUS_LABELS,
  type GeneratedBudgetListItem,
} from "@/features/presupuestos/types";

export const dynamic = "force-dynamic";

export default async function PresupuestosPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para ver tus presupuestos.
      </p>
    );
  }

  const rows = await prisma.generatedBudget.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      totalAmount: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  });

  const budgets: GeneratedBudgetListItem[] = rows.map((b) => ({
    id: b.id,
    title: b.title,
    totalAmount: b.totalAmount === null ? null : Number(b.totalAmount),
    currency: b.currency,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-heading">
            Presupuestos
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Los presupuestos generados con IA. Editalos y exportalos a Word o
            PDF.
          </p>
        </div>
        <Link href="/generar">
          <Button>Generar nuevo</Button>
        </Link>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-10" />}
          title="Todavía no generaste presupuestos"
          description="Describí el trabajo a cotizar y la IA arma el presupuesto usando tus históricos."
          action={
            <Link href="/generar">
              <Button>Generar el primero</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Título</TH>
              <TH>Total</TH>
              <TH>Estado</TH>
              <TH>Creado</TH>
            </tr>
          </THead>
          <tbody>
            {budgets.map((b) => (
              <TRow key={b.id}>
                <TD>
                  <Link
                    href={`/presupuestos/${b.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {b.title}
                  </Link>
                </TD>
                <TD className="tabular-nums">
                  {b.totalAmount !== null
                    ? formatMoney(b.totalAmount, b.currency)
                    : "—"}
                </TD>
                <TD>
                  <Badge variant={b.status === "FINAL" ? "success" : "warning"}>
                    {BUDGET_STATUS_LABELS[b.status]}
                  </Badge>
                </TD>
                <TD>{formatDate(b.createdAt)}</TD>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
