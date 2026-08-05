import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { MembershipRole } from "@prisma/client";

const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Admin",
  MEMBER: "Miembro",
};

const QUICK_ACCESS: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Panel" },
  { href: "/historicos", label: "Históricos" },
  { href: "/generar", label: "Generar" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/formatos", label: "Formatos" },
  { href: "/perfil", label: "Perfil" },
];

/** Pantalla de bienvenida post-login (landing por defecto), estilo hero +
 *  accesos rápidos — mismo rol que INICIO en ITZA. */
export function InicioScreen({
  displayName,
  role,
  tenantName,
}: {
  displayName: string;
  role: MembershipRole | null;
  tenantName: string;
}): React.ReactElement {
  const fecha = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-sm)]">
      <div
        className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-brand-aqua/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -right-10 size-72 rounded-full bg-brand-orange/10 blur-3xl"
        aria-hidden
      />
      <div className="h-1 bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange" />

      <div className="relative grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:p-12">
        <div className="flex min-w-0 flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-full)] border border-brand-blue/20 bg-brand-blue px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white">
            <span className="size-1.5 rounded-full bg-brand-orange" />
            Visión operativa
          </span>

          <h1 className="text-3xl font-black uppercase leading-tight tracking-tight text-text-heading sm:text-4xl">
            Bienvenido
            <span className="block bg-gradient-to-r from-brand-aqua to-brand-blue bg-clip-text text-transparent">
              {displayName}
            </span>
          </h1>

          <p className="max-w-xl text-sm font-medium text-text-muted">
            Este es tu espacio para generar presupuestos con IA, revisar tu
            histórico y mantener todo listo para enviar.
          </p>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <InfoChip label="Rol" value={role ? ROLE_LABEL[role] : "—"} />
            <InfoChip label="Empresa" value={tenantName} />
            <InfoChip label="Fecha" value={fecha} />
          </div>
        </div>

        <div className="w-full shrink-0 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.1em] text-brand-orange">
            Accesos rápidos
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {QUICK_ACCESS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-4 py-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-sm)]"
              >
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-text">
                  {item.label}
                </span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform group-hover:scale-110">
                  <ArrowRight className="size-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoChip({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-border border-l-4 border-l-primary bg-surface px-3 py-2">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-primary">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold text-text-heading">
        {value}
      </p>
    </div>
  );
}
