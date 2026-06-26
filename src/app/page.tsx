import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  Blocks,
  Briefcase,
  Building2,
  ChevronDown,
  Factory,
  FileText,
  FileUp,
  HeartPulse,
  Laptop,
  MessageSquareText,
  Palette,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Wand2,
  Wrench,
} from "lucide-react";
import { DemoRequest } from "@/features/landing/demo-request";
import { MarketingNav } from "@/features/landing/marketing-nav";
import { ParticleField } from "@/features/landing/particle-field";
import { ProductMockup } from "@/features/landing/product-mockup";

/**
 * Página de marketing (/). One-page con scroll que vende el producto y empuja
 * todo a "Solicitar demo" (sin alta self-serve ni precios). El login vive en
 * /ingresar.
 */
export default async function MarketingPage(): Promise<React.ReactElement> {
  // Con sesión iniciada, directo al panel.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="bg-bg text-text">
      <MarketingNav />
      <main>
        <Hero />
        <Metricas />
        <ComoFunciona />
        <DemoVisual />
        <Funciones />
        <Rubros />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero(): React.ReactElement {
  return (
    <section className="relative overflow-hidden">
      <ParticleField className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 pb-24 pt-20 text-center sm:pt-28">
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-brand-aqua/40 bg-brand-aqua/5 px-3.5 py-1.5 text-xs font-semibold text-brand-aqua backdrop-blur-sm">
          <Sparkles className="size-3.5" />
          IA entrenada con TUS presupuestos
        </span>

        <h1 className="max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight text-text-heading sm:text-5xl lg:text-6xl">
          Dejá de armar presupuestos.{" "}
          <span className="bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange bg-clip-text text-transparent">
            Empezá a cerrarlos.
          </span>
        </h1>

        <p className="max-w-2xl text-balance text-base leading-7 text-text-muted sm:text-lg sm:leading-8">
          CotizaAI aprende de los presupuestos que tu empresa ya hizo y genera
          los próximos en minutos: con tus precios ajustados por inflación, tu
          formato y tu logo. Pedilo en lenguaje natural, revisalo y envialo.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <DemoRequest size="lg" />
          <a
            href="#como-funciona"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface-elevated/80 px-5 py-2.5 text-sm font-semibold text-text backdrop-blur-sm transition-colors hover:border-brand-aqua/40 hover:text-brand-aqua"
          >
            Ver cómo funciona
            <ChevronDown className="size-4" />
          </a>
        </div>

        <p className="text-sm font-medium text-text-muted">
          Sin tarjeta · demo guiada con presupuestos de tu rubro
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- métricas */

const metricas = [
  { valor: "5 min", texto: "en vez de horas por presupuesto" },
  { valor: "100%", texto: "con tu formato, logo y firmas" },
  { valor: "IPC", texto: "precios ajustados por inflación, solos" },
  { valor: "Word + PDF", texto: "listos para enviar al cliente" },
];

function Metricas(): React.ReactElement {
  return (
    <section className="bg-brand-blue-900">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 text-center lg:grid-cols-4">
        {metricas.map((m) => (
          <div key={m.valor} className="flex flex-col gap-1">
            <span className="text-3xl font-bold tracking-tight text-white">
              {m.valor}
            </span>
            <span className="text-sm text-white/70">{m.texto}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- cómo funciona */

const pasos = [
  {
    icon: <FileUp className="size-5" />,
    titulo: "Subí tu histórico",
    texto:
      "Cargá los PDFs de presupuestos que ya hiciste (o importalos de Google Drive). CotizaAI los lee y los indexa.",
  },
  {
    icon: <Sparkles className="size-5" />,
    titulo: "La IA aprende de tu empresa",
    texto:
      "Precios, desgloses, condiciones de pago, forma de redactar: el modelo se arma con TU forma de cotizar, no con promedios de internet.",
  },
  {
    icon: <MessageSquareText className="size-5" />,
    titulo: "Pedilo en lenguaje natural",
    texto:
      "“Presupuesto para pintar un galpón de 400 m²”. La IA busca tus trabajos similares, ajusta los montos por inflación y arma el documento.",
  },
  {
    icon: <FileText className="size-5" />,
    titulo: "Revisá, exportá y envialo",
    texto:
      "Editás lo que quieras bloque por bloque y lo bajás en Word o PDF con tu branding. Listo para el cliente.",
  },
];

function ComoFunciona(): React.ReactElement {
  return (
    <section id="como-funciona" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading
          kicker="Cómo funciona"
          titulo="De tus PDFs viejos a presupuestos nuevos, en 4 pasos"
          texto="No hay que cargar listas de precios ni configurar plantillas complejas: tu histórico ya tiene todo."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pasos.map((p, i) => (
            <div
              key={p.titulo}
              className="relative rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-6 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-gradient-to-br from-brand-aqua to-brand-blue text-white">
                  {p.icon}
                </span>
                <span className="text-sm font-bold text-text-muted">
                  Paso {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-text-heading">
                {p.titulo}
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ demo visual */

function DemoVisual(): React.ReactElement {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading
          kicker="El producto"
          titulo="Así se ve generar un presupuesto"
          texto="Escribís el pedido como se lo contarías a un colega. CotizaAI hace el resto con datos de tu propia empresa."
        />
        <div className="mt-12">
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- features */

const funciones = [
  {
    icon: <Wand2 className="size-5 text-brand-aqua" />,
    chip: "bg-brand-aqua/10",
    titulo: "Tu histórico es el modelo",
    texto:
      "La IA no inventa precios: recupera tus presupuestos más parecidos al pedido y arma el nuevo a partir de ellos.",
  },
  {
    icon: <TrendingUp className="size-5 text-brand-blue" />,
    chip: "bg-brand-blue/10",
    titulo: "Inflación resuelta",
    texto:
      "Los montos históricos se traen a valor de hoy con el IPC acumulado. Nunca más cotizar con precios viejos.",
  },
  {
    icon: <Blocks className="size-5 text-brand-orange" />,
    chip: "bg-brand-orange/10",
    titulo: "Editor por bloques",
    texto:
      "Títulos, párrafos, listas y tablas editables. Ajustás lo que la IA propuso antes de marcarlo como final.",
  },
  {
    icon: <Palette className="size-5 text-brand-aqua" />,
    chip: "bg-brand-aqua/10",
    titulo: "Tu marca en cada documento",
    texto:
      "Logo, colores, membrete, firmas y formatos propios por tipo de presupuesto (estándar, licitación, etc.).",
  },
  {
    icon: <FileText className="size-5 text-brand-blue" />,
    chip: "bg-brand-blue/10",
    titulo: "Word y PDF al instante",
    texto:
      "Exportá el documento terminado en ambos formatos, con la misma calidad que si lo hubieras armado a mano.",
  },
  {
    icon: <ShieldCheck className="size-5 text-brand-orange" />,
    chip: "bg-brand-orange/10",
    titulo: "Tus datos, aislados",
    texto:
      "Cada empresa tiene su espacio separado: tu histórico solo entrena TUS presupuestos. Nada se comparte entre cuentas.",
  },
];

function Funciones(): React.ReactElement {
  return (
    <section id="funciones" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading
          kicker="Funciones"
          titulo="Todo lo que necesita un presupuesto profesional"
          texto="Pensado para empresas que cotizan seguido y pierden horas en cada documento."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {funciones.map((f) => (
            <div
              key={f.titulo}
              className="group rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-6 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-brand-aqua/40 hover:shadow-[var(--shadow-md)]"
            >
              <span
                className={`inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] ${f.chip}`}
              >
                {f.icon}
              </span>
              <h3 className="mt-4 text-base font-semibold text-text-heading">
                {f.titulo}
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">{f.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- rubros */

const rubros = [
  {
    icon: <Building2 className="size-4" />,
    nombre: "Construcción y obras",
    ejemplo: "Refacciones, instalaciones, obra seca",
  },
  {
    icon: <Wrench className="size-4" />,
    nombre: "Talleres y mantenimiento",
    ejemplo: "Mecánica, herrería, service industrial",
  },
  {
    icon: <Factory className="size-4" />,
    nombre: "Industria y fabricación",
    ejemplo: "Piezas a medida, montajes, provisión",
  },
  {
    icon: <Laptop className="size-4" />,
    nombre: "Tecnología y agencias",
    ejemplo: "Desarrollo, diseño, marketing",
  },
  {
    icon: <Briefcase className="size-4" />,
    nombre: "Servicios profesionales",
    ejemplo: "Consultoría, estudios, capacitaciones",
  },
  {
    icon: <Truck className="size-4" />,
    nombre: "Logística y transporte",
    ejemplo: "Fletes, mudanzas, distribución",
  },
  {
    icon: <HeartPulse className="size-4" />,
    nombre: "Salud y estética",
    ejemplo: "Equipamiento, tratamientos, planes",
  },
  {
    icon: <Sparkles className="size-4" />,
    nombre: "El tuyo",
    ejemplo: "Si cotizás por escrito, CotizaAI te sirve",
  },
];

function Rubros(): React.ReactElement {
  return (
    <section id="rubros" className="scroll-mt-20 border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading
          kicker="Rubros"
          titulo="Funciona para tu rubro, porque aprende de tu rubro"
          texto="Lo único que cambia entre empresas es el histórico y el perfil. El motor es el mismo: tus datos mandan."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rubros.map((r) => (
            <div
              key={r.nombre}
              className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-4 shadow-[var(--shadow-sm)]"
            >
              <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-brand-aqua/10 text-brand-aqua">
                {r.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-text-heading">
                  {r.nombre}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-text-muted">
                  {r.ejemplo}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- faq */

const faqs = [
  {
    q: "¿Necesito cargar mis listas de precios?",
    a: "No. CotizaAI extrae los precios de los presupuestos en PDF que ya hiciste y los ajusta por inflación al generar uno nuevo. Tu histórico ES tu lista de precios.",
  },
  {
    q: "¿Qué pasa con mis datos? ¿Otra empresa puede ver mis precios?",
    a: "No. Cada empresa tiene su espacio completamente aislado: tus documentos, precios y presupuestos generados solo son visibles para tu equipo, y la IA de otra cuenta jamás accede a tu información.",
  },
  {
    q: "¿Sirve si mis presupuestos tienen formatos distintos entre sí?",
    a: "Sí. El pipeline de extracción está pensado para PDFs reales y heterogéneos, con una instancia de revisión donde confirmás que los datos se leyeron bien antes de indexarlos.",
  },
  {
    q: "¿Puedo editar lo que genera la IA?",
    a: "Siempre. El presupuesto se arma por bloques (títulos, párrafos, listas, tablas) que editás como en un documento. Recién cuando lo marcás como final lo exportás a Word o PDF.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Pedí una demo: te mostramos CotizaAI funcionando con presupuestos de tu rubro y, si te cierra, el equipo deja tu cuenta configurada con tu histórico cargado.",
  },
];

function Faq(): React.ReactElement {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <SectionHeading
          kicker="FAQ"
          titulo="Preguntas frecuentes"
        />

        <div className="mt-10 flex flex-col gap-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-5 py-4 shadow-[var(--shadow-sm)] open:border-brand-aqua/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-text-heading [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- cta final */

function CtaFinal(): React.ReactElement {
  return (
    <section className="px-6 pb-20 sm:pb-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[var(--radius-lg)] bg-brand-blue-900 px-6 py-16 text-center sm:px-12">
        <div
          className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-brand-aqua/30 blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-brand-orange/20 blur-[100px]"
          aria-hidden
        />

        <h2 className="relative text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Tu próximo presupuesto puede llevarte 5 minutos
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-balance text-base leading-7 text-white/75">
          Pedí una demo guiada: la armamos con presupuestos de tu rubro para
          que veas exactamente cómo trabajaría con los tuyos.
        </p>
        <div className="relative mt-8 flex items-center justify-center gap-4">
          <DemoRequest size="lg" />
          <Link
            href="/ingresar"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 transition-colors hover:text-white"
          >
            Ya soy cliente
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- footer */

function Footer(): React.ReactElement {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-center sm:flex-row sm:text-left">
        <div>
          <p className="text-lg font-bold tracking-tight">
            <span className="text-brand-blue">Cotiza</span>
            <span className="text-brand-aqua">AI</span>
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Presupuestos profesionales con IA, entrenada con tu histórico.
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-text-muted">
          <a href="#como-funciona" className="transition-colors hover:text-text">
            Cómo funciona
          </a>
          <a href="#faq" className="transition-colors hover:text-text">
            FAQ
          </a>
          <Link href="/ingresar" className="transition-colors hover:text-text">
            Iniciar sesión
          </Link>
        </div>
        <p className="text-xs text-text-muted">
          © {new Date().getFullYear()} CotizaAI
        </p>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------- helpers */

function SectionHeading({
  kicker,
  titulo,
  texto,
}: {
  kicker: string;
  titulo: string;
  texto?: string;
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-brand-aqua">
        {kicker}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-text-heading sm:text-4xl">
        {titulo}
      </h2>
      {texto && (
        <p className="mt-4 text-balance text-base leading-7 text-text-muted">
          {texto}
        </p>
      )}
    </div>
  );
}
