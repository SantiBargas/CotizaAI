import { getCurrentTenant } from "@/lib/tenant";

export default async function DashboardPage() {
  const tenant = await getCurrentTenant();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-heading">
          Panel
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {tenant
            ? `Empresa activa: ${tenant.name}`
            : "Creá o seleccioná una empresa para empezar."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { titulo: "Históricos", valor: "—", nota: "PDFs indexados" },
          { titulo: "Presupuestos", valor: "—", nota: "generados" },
          { titulo: "Uso de IA", valor: "—", nota: "tokens este mes" },
        ].map((c) => (
          <div
            key={c.titulo}
            className="rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-6 shadow-[var(--shadow-sm)]"
          >
            <p className="text-sm text-text-muted">{c.titulo}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-text-heading">
              {c.valor}
            </p>
            <p className="mt-1 text-xs text-text-muted">{c.nota}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-elevated p-10 text-center">
        <p className="text-sm text-text-muted">
          Fase 1 (carga de históricos) y Fase 2 (motor RAG + generación) llegan
          próximamente.
        </p>
      </div>
    </div>
  );
}
