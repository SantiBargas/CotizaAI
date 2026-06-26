import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import { ArrowRight, FileText, Sparkles, TrendingUp } from "lucide-react";
import { DemoRequest } from "@/features/landing/demo-request";
import { ParticleField } from "@/features/landing/particle-field";

/**
 * Página de ingreso (/ingresar). Sin alta self-serve: las cuentas las da de
 * alta el equipo de CotizaAI — info del producto + inicio de sesión embebido
 * (70/30, sin scroll). Fondo de partículas reactivo al mouse.
 */
export default async function IngresarPage(): Promise<React.ReactElement> {
  // Con sesión iniciada la landing no existe: directo al panel.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  const features = [
    {
      icon: <FileText className="size-4 text-brand-aqua" />,
      chip: "bg-brand-aqua/10",
      titulo: "Tu histórico es el modelo",
      texto:
        "La IA aprende de tus PDFs reales: precios, desgloses y condiciones de TU empresa.",
    },
    {
      icon: <TrendingUp className="size-4 text-brand-blue" />,
      chip: "bg-brand-blue/10",
      titulo: "Precios a valor de hoy",
      texto:
        "Los montos históricos se ajustan por inflación (IPC) automáticamente.",
    },
    {
      icon: <Sparkles className="size-4 text-brand-orange" />,
      chip: "bg-brand-orange/10",
      titulo: "Listo para enviar",
      texto:
        "Editor de bloques + export a Word y PDF con tu logo, colores y firmas.",
    },
  ];

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg">
      {/* Partículas de marca reactivas al mouse, detrás de todo */}
      <ParticleField className="pointer-events-none absolute inset-0 z-0 h-full w-full" />

      <main className="z-10 grid h-full min-h-0 flex-1 grid-cols-[7fr_3fr]">
        {/* Columna izquierda (70%): info de producto */}
        <div className="relative flex min-h-0 flex-col items-center justify-center gap-5 overflow-hidden px-6 py-4 text-center sm:px-12">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]"
            aria-hidden
          />

          {/* Logo y CTA flotan sobre las partículas, sin barra de separación */}
          <Link
            href="/"
            className="absolute left-6 top-5 text-xl font-bold tracking-tight sm:left-10 sm:top-6"
          >
            <span className="text-brand-blue">Cotiza</span>
            <span className="text-brand-aqua">AI</span>
          </Link>
          <div className="absolute right-6 top-5 sm:right-10 sm:top-6">
            <DemoRequest />
          </div>

          <span className="relative inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-brand-aqua/40 bg-brand-aqua/5 px-3.5 py-1.5 text-xs font-semibold text-brand-aqua backdrop-blur-sm">
            <Sparkles className="size-3.5" />
            Presupuestos con IA · ajustados por inflación
          </span>

          <h1 className="relative max-w-3xl text-balance text-3xl font-bold leading-[1.1] tracking-tight text-text-heading lg:text-5xl xl:text-6xl">
            Generá presupuestos{" "}
            <span className="bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange bg-clip-text text-transparent">
              profesionales
            </span>{" "}
            en minutos
          </h1>

          <p className="relative max-w-xl text-balance text-sm leading-6 text-text-muted lg:text-lg lg:leading-8">
            Subí tus presupuestos históricos, configurá tu rubro y dejá que la
            IA aprenda de tu trabajo para generar cotizaciones nuevas, listas
            para enviar al cliente.
          </p>

          <div className="relative flex items-center gap-4">
            <DemoRequest size="lg" />
            <span className="hidden items-center gap-1.5 text-sm font-medium text-text-muted lg:inline-flex">
              Sin tarjeta · demo guiada
              <ArrowRight className="size-4 text-brand-orange" />
            </span>
          </div>

          <div className="relative mt-4 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.titulo}
                className="group rounded-[var(--radius-lg)] border border-border bg-surface-elevated/80 p-4 shadow-[var(--shadow-sm)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-brand-aqua/40 hover:shadow-[var(--shadow-md)]"
              >
                <span
                  className={`inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] ${f.chip}`}
                >
                  {f.icon}
                </span>
                <h3 className="mt-2.5 text-sm font-semibold text-text-heading">
                  {f.titulo}
                </h3>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {f.texto}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Columna derecha (30%): inicio de sesión para clientes existentes */}
        <div className="flex min-h-0 flex-col items-center justify-center gap-3 overflow-hidden border-l border-border bg-surface/75 px-4 py-4 backdrop-blur-xl">
          <div className="w-full max-w-sm">
            <p className="mb-3 text-center text-sm font-semibold text-text-heading">
              ¿Ya sos cliente?
            </p>
            <SignIn
              routing="hash"
              fallbackRedirectUrl="/dashboard"
              appearance={{
                variables: {
                  colorPrimary: "#008e97",
                  fontSizeBase: "0.8125rem",
                  spacingUnit: "0.85rem",
                  borderRadius: "10px",
                },
                elements: {
                  rootBox: "w-full",
                  cardBox: "w-full shadow-[var(--shadow-md)]",
                  card: "w-full",
                  footer: "hidden",
                  footerAction: "hidden",
                },
              }}
            />
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-text-muted">
              <span>¿Todavía no tenés cuenta?</span>
              <DemoRequest />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
