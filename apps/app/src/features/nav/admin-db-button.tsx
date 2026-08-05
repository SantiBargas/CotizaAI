import Link from "next/link";
import { Database } from "lucide-react";

/** Acceso al panel de administración de base de datos — visible solo para
 *  OWNER/ADMIN (gateado por el server component que lo monta; la ruta en sí
 *  también gatea por rol en (app)/basedatos/layout.tsx). */
export function AdminDbButton(): React.ReactElement {
  return (
    <Link
      href="/basedatos"
      title="Base de datos (admin)"
      aria-label="Base de datos (admin)"
      className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary shadow-[var(--shadow-sm)] transition-all duration-200 hover:bg-primary hover:text-primary-fg"
    >
      <Database className="size-3.5" />
    </Link>
  );
}
