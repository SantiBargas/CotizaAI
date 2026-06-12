"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const navLinks: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Panel" },
  { href: "/historicos", label: "Históricos" },
  { href: "/generar", label: "Generar" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/perfil", label: "Perfil" },
  { href: "/configuracion", label: "Configuración" },
];

/** Nav principal con estado activo en aqua de marca. */
export function AppNav(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {navLinks.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:bg-surface hover:text-text",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
