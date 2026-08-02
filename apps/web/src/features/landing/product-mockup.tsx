import { FileDown, Sparkles, Wand2 } from "lucide-react";

/**
 * Mockup estilizado del generador (sin capturas): a la izquierda el pedido en
 * lenguaje natural, a la derecha el presupuesto que la IA arma por bloques.
 * Es ilustrativo — los datos son de ejemplo.
 */
export function ProductMockup(): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-lg)]">
      {/* Barra de ventana */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-error/60" aria-hidden />
        <span className="size-2.5 rounded-full bg-brand-orange/60" aria-hidden />
        <span className="size-2.5 rounded-full bg-success/60" aria-hidden />
        <span className="ml-3 hidden rounded-[var(--radius-sm)] bg-bg px-2.5 py-0.5 text-[11px] text-text-muted sm:inline">
          cotizaai.app/generar
        </span>
      </div>

      <div className="grid md:grid-cols-[2fr_3fr]">
        {/* Pedido en lenguaje natural */}
        <div className="flex flex-col gap-3 border-b border-border p-5 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Tu pedido
          </p>
          <div className="rounded-[var(--radius-md)] rounded-tl-none border border-border bg-surface p-3.5 text-left text-sm leading-6 text-text">
            Presupuesto para <strong>impermeabilización de techo</strong> de
            120 m² en nave industrial, con membrana y mano de obra. Cliente:
            Metalúrgica San Justo.
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-[var(--radius-md)] bg-brand-aqua/10 px-3 py-2 text-xs font-medium text-brand-aqua">
            <Sparkles className="size-3.5 shrink-0" />
            Usando 3 presupuestos similares de tu histórico · precios ajustados
            por IPC
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3.5 py-2 text-xs font-semibold text-primary-fg">
            <Wand2 className="size-3.5" />
            Generar presupuesto
          </span>
        </div>

        {/* Presupuesto generado por bloques */}
        <div className="flex flex-col gap-2.5 p-5 text-left">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Resultado
            </p>
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              Listo en 28 s
            </span>
          </div>

          <div className="rounded-[var(--radius-md)] border border-border bg-bg p-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <p className="text-sm font-bold text-text-heading">
                  PRESUPUESTO N° 0147
                </p>
                <p className="text-[11px] text-text-muted">
                  Metalúrgica San Justo · Impermeabilización 120 m²
                </p>
              </div>
              <span className="rounded-[var(--radius-sm)] bg-gradient-to-br from-brand-aqua to-brand-blue px-2 py-1 text-[10px] font-bold text-white">
                TU LOGO
              </span>
            </div>

            <table className="mt-2.5 w-full text-[11px]">
              <tbody className="text-text">
                <tr className="border-b border-border/60">
                  <td className="py-1.5">Membrana asfáltica 4mm c/aluminio</td>
                  <td className="py-1.5 text-right tabular-nums">$ 1.860.000</td>
                </tr>
                <tr className="border-b border-border/60">
                  <td className="py-1.5">Imprimación y sellado de juntas</td>
                  <td className="py-1.5 text-right tabular-nums">$ 412.000</td>
                </tr>
                <tr>
                  <td className="py-1.5">Mano de obra especializada</td>
                  <td className="py-1.5 text-right tabular-nums">$ 1.290.000</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-2.5 flex items-center justify-between rounded-[var(--radius-sm)] bg-brand-blue-900 px-3 py-2">
              <span className="text-[11px] font-semibold text-white">
                TOTAL (IVA incluido)
              </span>
              <span className="text-sm font-bold tabular-nums text-white">
                $ 3.562.000
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-text">
              <FileDown className="size-3.5" />
              Word
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-text">
              <FileDown className="size-3.5" />
              PDF
            </span>
            <span className="ml-auto text-[11px] text-text-muted">
              Editable bloque por bloque
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
