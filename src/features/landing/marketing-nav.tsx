import Link from "next/link";
import { LogIn } from "lucide-react";
import { DemoRequest } from "./demo-request";

const sections: Array<{ href: string; label: string }> = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#funciones", label: "Funciones" },
  { href: "#rubros", label: "Rubros" },
  { href: "#faq", label: "FAQ" },
];

/**
 * Nav sticky de la página de marketing: anclas a secciones + "Iniciar sesión"
 * (→ /ingresar) + CTA "Solicitar demo". Translúcido con blur sobre el hero.
 */
export function MarketingNav(): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <span className="text-brand-blue">Cotiza</span>
          <span className="text-brand-aqua">AI</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {sections.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/ingresar"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <LogIn className="size-4" />
            Iniciar sesión
          </Link>
          <DemoRequest />
        </div>
      </div>
    </header>
  );
}
