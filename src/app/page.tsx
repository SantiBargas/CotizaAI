import Link from "next/link";
import { Show } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-bg">
      {/* Regla de marca: aqua → azul → naranja (Miami Dolphins) */}
      <div className="h-1 bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange" />
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-brand-blue">Cotiza</span>
          <span className="text-brand-aqua">AI</span>
        </span>
        <nav className="flex items-center gap-3">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-text hover:bg-surface"
            >
              Ingresar
            </Link>
            <Link
              href="/sign-up"
              className="rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              Crear cuenta
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              Ir al panel
            </Link>
          </Show>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <span className="rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
          Presupuestos con IA · ajustados por inflación
        </span>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-text-heading sm:text-5xl">
          Generá presupuestos profesionales en minutos
        </h1>
        <p className="max-w-xl text-lg leading-8 text-text-muted">
          Subí tus presupuestos históricos, configurá tu rubro y dejá que la IA
          aprenda de tu trabajo para generar cotizaciones nuevas, listas para
          enviar al cliente.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Show when="signed-out">
            <Link
              href="/sign-up"
              className="rounded-[var(--radius-md)] bg-primary px-6 py-3 text-base font-medium text-primary-fg shadow-[var(--shadow-sm)] hover:bg-primary-hover"
            >
              Empezar gratis
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-[var(--radius-md)] bg-primary px-6 py-3 text-base font-medium text-primary-fg shadow-[var(--shadow-sm)] hover:bg-primary-hover"
            >
              Ir al panel
            </Link>
          </Show>
        </div>
      </main>
    </div>
  );
}
