"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Modal, useToast } from "@cotizaai/ui";

/**
 * "Reglas IA": muestra el industryPrompt del CompanyProfile — el prompt de
 * rubro que ya se configura en /perfil. Es el equivalente en CotizaAI a las
 * reglas de ingeniería hardcodeadas de ITZA, pero por-tenant.
 */
export function ReglasIaModal({
  open,
  onClose,
  industryPrompt,
}: {
  open: boolean;
  onClose: () => void;
  industryPrompt: string | null;
}): React.ReactElement {
  return (
    <Modal open={open} onClose={onClose} title="Reglas de la IA para tu empresa">
      {industryPrompt ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            Esto es lo que le decimos a la IA sobre tu rubro cada vez que
            generás un presupuesto — configurado en Perfil.
          </p>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-text">
            {industryPrompt}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Todavía no configuraste el perfil de tu rubro. Andá a{" "}
          <a href="/perfil" className="text-primary underline-offset-2 hover:underline">
            Perfil
          </a>{" "}
          para completarlo — es lo que más mejora la calidad de lo que genera
          la IA.
        </p>
      )}
    </Modal>
  );
}

const AYUDA_TIPS = [
  "Cuanto más detalle des (alcance, cantidades, plazos, ubicación), mejor sale el resultado.",
  "Si ya cotizaste algo parecido antes, decilo (\"como el trabajo de tal cliente\") — la IA busca en tus históricos.",
  "Podés pedir cambios en el mismo hilo: \"sacale el ítem de mano de obra\" o \"subí el total a...\".",
  "El nivel de detalle (Breve/Normal/Detallado) y las secciones a incluir están en el botón + del compositor.",
  "Si ya tenés un presupuesto armado en otro lado, subilo o pegalo como JSON en el panel derecho — no gasta generaciones.",
];

/** Modal de ayuda con tips genéricos de uso del generador. */
export function AyudaModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Modal open={open} onClose={onClose} title="Cómo usar el generador">
      <ul className="flex flex-col gap-2.5 text-sm text-text">
        {AYUDA_TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {tip}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function buildExternalPrompt(industryPrompt: string | null): string {
  const contexto = industryPrompt
    ? `\nContexto del rubro de la empresa (seguí este estilo/reglas):\n${industryPrompt}\n`
    : "";
  return `Generá un presupuesto para: [DESCRIBÍ ACÁ EL TRABAJO A COTIZAR]
${contexto}
Devolvé ÚNICAMENTE un JSON válido con esta estructura exacta, sin texto antes ni después:

{
  "titulo": string,
  "ubicacion": string | null,
  "fecha": string | null,        // formato yyyy-mm-dd
  "concepto": string | null,
  "cotizacionTotal": number | null,
  "moneda": string,              // ej "ARS", "USD"
  "formaPago": string | null,
  "validezDias": number | null,
  "cuerpo": [
    { "type": "titulo", "texto": string },
    { "type": "subtitulo", "texto": string },
    { "type": "parrafo", "texto": string },
    { "type": "lista", "items": string[] },
    { "type": "tabla", "encabezados": string[], "filas": string[][] }
  ]
}

Reglas:
- No inventes precios que no te haya dado.
- No generes bloques de tipo "imagen" (los agrega el usuario después).
- Combiná los tipos de bloque de "cuerpo" en el orden que tenga sentido para el documento.
- Todo el texto en español.`;
}

/**
 * "Prompt IA" externo: genera un bloque copiable con el contrato JSON del
 * presupuesto, para pegar en otra IA (ChatGPT, Claude, etc.) y después
 * importar el resultado con "Subir/pegar JSON" — sin gastar tokens propios.
 */
export function PromptExternoModal({
  open,
  onClose,
  industryPrompt,
}: {
  open: boolean;
  onClose: () => void;
  industryPrompt: string | null;
}): React.ReactElement {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const texto = buildExternalPrompt(industryPrompt);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("error", "No se pudo copiar. Seleccioná el texto a mano.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Prompt para usar en otra IA">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          Copiá esto, completalo con tu pedido y pegalo en ChatGPT, Claude u
          otra IA. Después subí o pegá el JSON que te devuelva en el panel
          derecho — se importa directo, sin gastar generaciones de tu plan.
        </p>
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2.5 font-mono text-[11px] leading-relaxed text-text">
          {texto}
        </pre>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void handleCopy()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
