import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { parseTemplateConfig } from "@/types/budget-template";
import { FormatosPanel } from "@/features/formatos/formatos-panel";

export const dynamic = "force-dynamic";

export default async function FormatosPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para configurar los formatos.
      </p>
    );
  }

  const templates = await prisma.budgetTemplate.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-heading">
          Formatos de presupuesto
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Creá distintos &quot;prototipos&quot; de formato (presupuesto
          estándar, licitación, etc.) y elegí cuál usar al exportar. Subí un
          Word de referencia para que la IA proponga la configuración.
        </p>
      </div>

      <FormatosPanel
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          isDefault: t.isDefault,
          config: parseTemplateConfig(t.config),
        }))}
      />
    </div>
  );
}
