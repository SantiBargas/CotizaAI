"use client";

import { useLayoutEffect, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  FileJson,
  FileText,
  History,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge, Button, cn } from "@cotizaai/ui";
import { formatMoney } from "@/lib/format";
import {
  generatedBudgetPayloadSchema,
  type GeneratedBudgetPayload,
} from "@/types/budget";
import { BudgetEditor } from "@/features/presupuestos/budget-editor";
import type { GeneratedBudgetDetail } from "@/features/presupuestos/types";
import {
  GeneratorSessionsSidebar,
  ToggleSessionsSidebarButton,
  type SessionSummary,
} from "@/features/generar/generator-sessions-sidebar";
import {
  AyudaModal,
  PromptExternoModal,
  ReglasIaModal,
} from "@/features/generar/generar-help-modals";

/** Resultado de una generación, tal como lo devuelve POST /api/generar. */
interface GenerationResult {
  budgetId: string;
  title: string;
  totalAmount: number | null;
  currency: string;
  ragMode: "vectorial" | "lexico" | "none";
  sourceCount: number;
  provider: string;
  model: string;
}

type NivelDetalle = "breve" | "normal" | "detallado";

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; state: "loading" }
  | { id: number; role: "assistant"; state: "done"; result: GenerationResult }
  | {
      id: number;
      role: "assistant";
      state: "error";
      error: string;
      retryText: string;
    }
  /** Mensaje de una sesión retomada: ya no tenemos el GenerationResult
   *  completo, solo el texto guardado. */
  | { id: number; role: "assistant"; state: "restored"; text: string };

const RAG_LABELS: Record<GenerationResult["ragMode"], string> = {
  vectorial: "RAG vectorial",
  lexico: "RAG léxico",
  none: "Sin históricos",
};

const FASES_GENERACION = [
  "Buscando históricos relevantes…",
  "Ajustando precios por inflación…",
  "Redactando el presupuesto…",
  "Armando bloques y tablas…",
];

const NIVELES: Array<{ id: NivelDetalle; label: string }> = [
  { id: "breve", label: "Breve" },
  { id: "normal", label: "Normal" },
  { id: "detallado", label: "Detallado" },
];

/** Secciones sugeribles del presupuesto (patrón ITZA, genéricas para todo
 *  rubro). Las elegidas se inyectan como instrucción extra en el prompt. */
const SECCIONES_PRESUPUESTO = [
  "Alcance del trabajo",
  "Metodología / etapas",
  "Plazos de entrega",
  "Forma de pago",
  "Exclusiones",
  "Garantía",
] as const;

/**
 * Normaliza un JSON externo al contrato de CotizaAI antes de validar con Zod:
 * acepta también las variantes snake_case / `columnas` del contrato ITZA para
 * que un JSON generado con ese prompt en otra IA se pueda importar directo.
 */
function normalizarJsonImportado(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (o.cotizacionTotal === undefined && o.cotizacion_total !== undefined) {
    o.cotizacionTotal = o.cotizacion_total;
  }
  if (o.formaPago === undefined && o.forma_pago !== undefined) {
    o.formaPago = o.forma_pago;
  }
  if (o.validezDias === undefined && o.validez_dias !== undefined) {
    o.validezDias = o.validez_dias;
  }
  if (typeof o.moneda !== "string" || !o.moneda) o.moneda = "ARS";
  for (const k of ["ubicacion", "fecha", "concepto", "cotizacionTotal", "formaPago", "validezDias"]) {
    if (o[k] === undefined) o[k] = null;
  }
  if (Array.isArray(o.cuerpo)) {
    o.cuerpo = o.cuerpo.map((b) => {
      if (b == null || typeof b !== "object" || Array.isArray(b)) return b;
      const blk = { ...(b as Record<string, unknown>) };
      if (blk.type === "tabla" && blk.encabezados === undefined && Array.isArray(blk.columnas)) {
        blk.encabezados = blk.columnas;
      }
      return blk;
    });
  }
  return o;
}

let nextId = 1;

export interface GenerarChatProps {
  nombre: string;
  frase: string;
  industry: string | null;
  industryPrompt: string | null;
  usage: { used: number; limit: number };
  providers: Array<{ id: string; label: string }>;
}

/** Convierte el historial de UI a la forma simple que persisten las sesiones
 *  (rol + texto plano). Los mensajes en curso (loading/error) no se guardan. */
function toApiMessages(
  messages: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.state === "done") {
      out.push({ role: "assistant", content: `Generé: ${m.result.title}` });
    } else if (m.state === "restored") {
      out.push({ role: "assistant", content: m.text });
    }
  }
  return out;
}

/**
 * Generador conversacional (estilo Gemini) con editor embebido (estilo ITZA):
 * chat a la izquierda, y al generar se abre el editor de bloques del borrador
 * en un panel a la derecha (pantallas xl).
 */
export function GenerarChat({
  nombre,
  frase,
  industry,
  industryPrompt,
  usage,
  providers,
}: GenerarChatProps): React.ReactElement {
  const router = useRouter();
  const [reglasOpen, setReglasOpen] = useState(false);
  const [promptExternoOpen, setPromptExternoOpen] = useState(false);
  const [ayudaOpen, setAyudaOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [nivel, setNivel] = useState<NivelDetalle>("normal");
  const [provider, setProvider] = useState(providers[0]?.id ?? "");
  const [used, setUsed] = useState(usage.used);
  const [generating, setGenerating] = useState(false);
  const [activeBudget, setActiveBudget] =
    useState<GeneratedBudgetDetail | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastSavedSession, setLastSavedSession] = useState<SessionSummary | null>(
    null,
  );
  const [secciones, setSecciones] = useState<string[]>([]);
  const [seccionesOpen, setSeccionesOpen] = useState(false);
  const [adjuntarInfoOpen, setAdjuntarInfoOpen] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [jsonPegado, setJsonPegado] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const savingSessionRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const adjuntarMenuRef = useRef<HTMLDivElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  // Cierra el aviso de "adjuntar archivos" y el menú de proveedor al
  // clickear afuera (mismo patrón que los menús flotantes de ITZA).
  useEffect(() => {
    if (!adjuntarInfoOpen && !providerMenuOpen) return;
    function onClickOutside(e: MouseEvent): void {
      const target = e.target as Node;
      if (!adjuntarMenuRef.current?.contains(target)) {
        setAdjuntarInfoOpen(false);
      }
      if (!providerMenuRef.current?.contains(target)) {
        setProviderMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [adjuntarInfoOpen, providerMenuOpen]);

  const remaining = Math.max(0, usage.limit - used);
  const empty = messages.length === 0;

  // Autosave del historial: crea la sesión en el primer turno y la actualiza
  // en los siguientes (debounce 1.5s, mismo patrón que ITZA).
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      if (savingSessionRef.current) return;
      savingSessionRef.current = true;
      const apiMessages = toApiMessages(messages);
      const lastDone = [...messages]
        .reverse()
        .find((m): m is Extract<ChatMessage, { state: "done" }> =>
          m.role === "assistant" && m.state === "done",
        );
      const tituloBase =
        lastDone?.result.title ??
        messages.find((m): m is Extract<ChatMessage, { role: "user" }> => m.role === "user")
          ?.text.slice(0, 60) ??
        "Nuevo presupuesto";
      const body = { titulo: tituloBase, mensajes: apiMessages };
      const req = sessionId
        ? fetch(`/api/generador-sesiones/${sessionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : fetch("/api/generador-sesiones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      req
        .then((r) => (r.ok ? (r.json() as Promise<{ id?: string }>) : null))
        .then((data) => {
          const id = sessionId ?? data?.id ?? null;
          if (!sessionId && data?.id) setSessionId(data.id);
          if (id) {
            setLastSavedSession({ id, title: tituloBase, updatedAt: new Date().toISOString() });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          savingSessionRef.current = false;
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, [messages, sessionId]);

  function handleNewChat(): void {
    setMessages([]);
    setActiveBudget(null);
    setSessionId(null);
  }

  async function handleSelectSession(id: string): Promise<void> {
    const res = await fetch(`/api/generador-sesiones/${id}`);
    if (!res.ok) return;
    const json = (await res.json()) as {
      session?: {
        id: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
      };
    };
    if (!json.session) return;
    setMessages(
      json.session.messages.map((m) =>
        m.role === "user"
          ? { id: nextId++, role: "user", text: m.content }
          : { id: nextId++, role: "assistant", state: "restored", text: m.content },
      ),
    );
    setActiveBudget(null);
    setSessionId(json.session.id);
  }

  function handleSessionDeleted(id: string): void {
    if (id === sessionId) handleNewChat();
  }

  // Auto-resize del textarea: una línea al inicio, crece hasta el max-h.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // Scroll al fondo del hilo en cada mensaje nuevo (solo el contenedor).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend(rawText?: string): Promise<void> {
    const text = (rawText ?? input).trim();
    if (text.length < 10 || generating) return;

    const userMsg: ChatMessage = { id: nextId++, role: "user", text };
    const loadingMsg: ChatMessage = {
      id: nextId++,
      role: "assistant",
      state: "loading",
    };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setGenerating(true);

    // Las secciones elegidas viajan como instrucción extra del prompt (el
    // mensaje visible en el hilo queda tal cual lo escribió el usuario).
    const promptFinal =
      secciones.length > 0
        ? `${text}\n\nIncluí obligatoriamente estas secciones en el presupuesto: ${secciones.join(", ")}.`
        : text;

    try {
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptFinal,
          nivelDetalle: nivel,
          ...(provider && { provider }),
          // Si ya hay un presupuesto activo en este hilo, el pedido es un
          // cambio sobre ese mismo presupuesto (edición), no uno nuevo.
          ...(activeBudget && { budgetId: activeBudget.id }),
        }),
      });
      const json = (await res.json()) as {
        budget?: {
          id: string;
          title: string;
          totalAmount: number | null;
          currency: string;
          content: GeneratedBudgetPayload;
        };
        ragMode?: GenerationResult["ragMode"];
        sourceCount?: number;
        provider?: string;
        model?: string;
        error?: string;
      };
      if (!res.ok || !json.budget) {
        throw new Error(json.error ?? "No se pudo generar el presupuesto.");
      }
      const result: GenerationResult = {
        budgetId: json.budget.id,
        title: json.budget.title,
        totalAmount: json.budget.totalAmount,
        currency: json.budget.currency,
        ragMode: json.ragMode ?? "none",
        sourceCount: json.sourceCount ?? 0,
        provider: json.provider ?? "",
        model: json.model ?? "",
      };
      setUsed((u) => u + 1);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { id: m.id, role: "assistant", state: "done", result }
            : m,
        ),
      );
      // Abre el borrador en el panel derecho (como el constructor de ITZA).
      setActiveBudget({
        id: json.budget.id,
        title: json.budget.title,
        totalAmount: json.budget.totalAmount,
        currency: json.budget.currency,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        requestPrompt: text,
        content: json.budget.content,
        ragSourceIds: [],
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                id: m.id,
                role: "assistant",
                state: "error",
                error:
                  err instanceof Error ? err.message : "Error inesperado.",
                retryText: text,
              }
            : m,
        ),
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleRetry(msg: Extract<ChatMessage, { state: "error" }>): void {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    void handleSend(msg.retryText);
  }

  function toggleSeccion(s: string): void {
    setSecciones((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  /** Importa un JSON externo (pegado o archivo): valida contra el contrato,
   *  lo persiste como DRAFT sin gastar tokens y abre el editor. */
  async function handleImportJson(raw: string): Promise<void> {
    setImportError(null);
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(raw);
    } catch {
      setImportError("El texto no es JSON válido.");
      return;
    }
    const parsed = generatedBudgetPayloadSchema.safeParse(
      normalizarJsonImportado(parsedRaw),
    );
    if (!parsed.success) {
      setImportError(
        "El JSON no cumple el contrato de presupuesto (revisá bloques y campos).",
      );
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/presupuestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: parsed.data }),
      });
      const json = (await res.json()) as {
        budget?: {
          id: string;
          title: string;
          totalAmount: number | string | null;
          currency: string;
          createdAt: string;
          content: GeneratedBudgetPayload;
        };
        error?: string;
      };
      if (!res.ok || !json.budget) {
        throw new Error(json.error ?? "No se pudo importar el presupuesto.");
      }
      const b = json.budget;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "assistant",
          state: "restored",
          text: `Importé desde JSON: ${b.title}`,
        },
      ]);
      setActiveBudget({
        id: b.id,
        title: b.title,
        totalAmount: b.totalAmount != null ? Number(b.totalAmount) : null,
        currency: b.currency,
        status: "DRAFT",
        createdAt: b.createdAt,
        requestPrompt: "(importado desde JSON externo)",
        content: b.content,
        ragSourceIds: [],
      });
      setJsonPegado("");
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "No se pudo importar el presupuesto.",
      );
    } finally {
      setImporting(false);
    }
  }

  function onArchivoJsonElegido(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      void handleImportJson(String(reader.result ?? ""));
    };
    reader.onerror = () => setImportError("No se pudo leer el archivo.");
    reader.readAsText(file);
  }

  const lastResult = [...messages]
    .reverse()
    .find(
      (m): m is Extract<ChatMessage, { state: "done" }> =>
        m.role === "assistant" && m.state === "done",
    );

  // Compositor: mismo bloque tanto en el estado vacío (centrado, junto a la
  // frase de bienvenida) como una vez que hay mensajes (anclado abajo).
  const composerBody = (
    <>
      <div className="rounded-[1.4rem] border border-border bg-surface-elevated shadow-[var(--shadow-md)] transition-colors focus-within:border-primary/60">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="relative shrink-0" ref={adjuntarMenuRef}>
            <button
              type="button"
              onClick={() => setAdjuntarInfoOpen((o) => !o)}
              disabled={generating}
              aria-expanded={adjuntarInfoOpen}
              aria-label="Info sobre adjuntar archivos"
              title="Adjuntar archivos — próximamente"
              className="flex size-9 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-45"
            >
              <Plus className="size-4" />
            </button>
            {adjuntarInfoOpen && (
              <div
                role="dialog"
                className="absolute bottom-full left-0 z-20 mb-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-lg)]"
              >
                <p className="px-3 py-2.5 text-[11px] leading-relaxed text-text-muted">
                  <strong className="text-text-heading">
                    Adjuntar archivos — próximamente.
                  </strong>{" "}
                  Se omite para cuidar el consumo de tokens de los planes
                  gratuitos de IA. Se habilitará cuando tengamos un plan pago.
                </p>
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            disabled={generating}
            placeholder={
              industry
                ? `Describí el trabajo de ${industry} a cotizar…`
                : "Describí el trabajo a cotizar…"
            }
            className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm leading-relaxed text-text placeholder:text-text-muted focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={generating || input.trim().length < 10}
            aria-label="Generar presupuesto"
            title="Generar (Enter)"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[var(--shadow-sm)] transition-all hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? (
              <span className="flex items-center gap-0.5" aria-hidden>
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="size-1 animate-bounce rounded-full bg-primary-fg"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </span>
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>

        {seccionesOpen && (
          <div className="flex flex-col gap-2.5 border-t border-border/60 px-4 pb-3 pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex items-center gap-1"
                role="radiogroup"
                aria-label="Nivel de detalle"
              >
                {NIVELES.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    role="radio"
                    aria-checked={nivel === n.id}
                    onClick={() => setNivel(n.id)}
                    disabled={generating}
                    className={cn(
                      "rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      nivel === n.id
                        ? "bg-primary/10 text-primary"
                        : "text-text-muted hover:bg-surface hover:text-text",
                    )}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  remaining === 0
                    ? "font-semibold text-error"
                    : "text-text-muted",
                )}
              >
                {remaining === 0
                  ? "Sin generaciones — mejorá tu plan"
                  : `${remaining} generaciones disponibles este mes`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Incluir secciones:
              </span>
              {SECCIONES_PRESUPUESTO.map((s) => {
                const active = secciones.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeccion(s)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-[var(--radius-full)] border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      active
                        ? "border-[var(--brand-orange)]/50 bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]"
                        : "border-border text-text-muted hover:border-[var(--brand-orange)]/40 hover:text-text",
                    )}
                  >
                    {active ? "✓ " : ""}
                    {s}
                  </button>
                );
              })}
              {secciones.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSecciones([])}
                  className="ml-1 text-[10px] font-semibold text-text-muted underline-offset-2 hover:text-error hover:underline"
                >
                  limpiar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Selector de proveedor: 2da fila dentro del mismo contenedor del
            compositor, no un elemento aparte. Dropdown propio (no <select>
            nativo) para poder mostrar el punto de estado y el chevron,
            mismo patrón que el menú de proveedor de ITZA. */}
        {providers.length > 0 && (
          <div className="flex justify-center border-t border-border/60 py-2.5">
          <div className="relative" ref={providerMenuRef}>
            <button
              type="button"
              onClick={() => setProviderMenuOpen((o) => !o)}
              disabled={generating}
              aria-expanded={providerMenuOpen}
              aria-label="Proveedor de IA"
              title={providers.find((p) => p.id === provider)?.label}
              className="flex items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-surface-elevated px-3 py-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:bg-surface disabled:opacity-60"
            >
              <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
              <span className="max-w-[12rem] truncate">
                {providers.find((p) => p.id === provider)?.label ?? ""}
              </span>
              <ChevronDown
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  providerMenuOpen && "rotate-180",
                )}
              />
            </button>
            {providerMenuOpen && (
              <div className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-lg)]">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProvider(p.id);
                      setProviderMenuOpen(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2.5 text-left text-sm transition-colors",
                      provider === p.id
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-text hover:bg-surface",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative left-1/2 flex min-h-0 w-screen flex-1 -translate-x-1/2 flex-col overflow-x-hidden px-4 sm:px-6 lg:px-8">
      {/* Fuera del flujo del sidebar a propósito: así no se corre cuando la
          barra abre/cierra y se puede togglear sin mover el mouse. */}
      <div className="absolute left-4 top-0.5 z-10 sm:left-6 lg:left-8">
        <ToggleSessionsSidebarButton
          open={sidebarOpen}
          onClick={() => setSidebarOpen((o) => !o)}
        />
      </div>

      <div className="origin-top grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch xl:overflow-hidden xl:[zoom:0.9]">
        {/* Columna izquierda: historial (si está abierto) + chat. La única que scrollea. */}
        <div className="flex min-h-0 min-w-0 gap-4 overflow-hidden">
          <GeneratorSessionsSidebar
            open={sidebarOpen}
            currentSessionId={sessionId}
            lastSavedSession={lastSavedSession}
            onSelectSession={(id) => void handleSelectSession(id)}
            onNewChat={handleNewChat}
            onSessionDeleted={handleSessionDeleted}
            onAbrirPromptExterno={() => setPromptExternoOpen(true)}
            onAbrirReglasIa={() => setReglasOpen(true)}
            onAbrirAyuda={() => setAyudaOpen(true)}
            opcionesAbiertas={seccionesOpen}
            onToggleOpciones={() => setSeccionesOpen((o) => !o)}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-4 xl:pr-4">
            {empty ? (
              /* Estado vacío: frase + compositor + selector, agrupados cerca
                 del tope (no centrados en todo el alto — en pantallas altas
                 eso dejaba un hueco enorme arriba). */
              <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 text-center">
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[60px]"
                  aria-hidden
                />
                <h2 className="relative text-balance bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange bg-clip-text text-xl font-bold tracking-tight text-transparent sm:text-2xl">
                  {nombre
                    ? frase.replace("{nombre}", nombre)
                    : frase.replace(", {nombre}", "").replace("{nombre}", "")}
                </h2>
                <div className="relative mt-6 w-full max-w-2xl text-left">
                  {composerBody}
                </div>
              </div>
            ) : (
              <>
              <div ref={scrollRef} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <ul className="flex flex-col gap-5 pb-4 pr-1">
                  {lastResult && (
                    <li className="flex justify-center pb-1">
                      <span
                        className="inline-flex items-center gap-1.5 truncate rounded-[var(--radius-full)] border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary"
                        title={`Se usó ${lastResult.result.model} · ${RAG_LABELS[lastResult.result.ragMode]}`}
                      >
                        <span
                          className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                          aria-hidden
                        />
                        Se usó: {lastResult.result.model} ·{" "}
                        {RAG_LABELS[lastResult.result.ragMode]}
                      </span>
                    </li>
                  )}
                  {messages.map((m) =>
                    m.role === "user" ? (
                      <li key={m.id} className="flex justify-end pl-10">
                        <div className="max-w-[min(100%,40rem)] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-fg shadow-[var(--shadow-sm)]">
                          <span className="whitespace-pre-wrap break-words">
                            {m.text}
                          </span>
                        </div>
                      </li>
                    ) : (
                      <li key={m.id} className="flex gap-3 pr-6">
                        <div
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-aqua to-brand-blue text-primary-fg shadow-[var(--shadow-sm)]"
                          aria-hidden
                        >
                          <Sparkles className="size-4" />
                        </div>
                        {m.state === "loading" ? (
                          <LoadingBubble />
                        ) : m.state === "restored" ? (
                          <div className="max-w-[min(100%,40rem)] rounded-2xl rounded-tl-md border border-border bg-surface-elevated px-4 py-2.5 text-sm leading-relaxed text-text shadow-[var(--shadow-sm)]">
                            <span className="whitespace-pre-wrap break-words">
                              {m.text}
                            </span>
                          </div>
                        ) : m.state === "error" ? (
                          <div className="flex max-w-[min(100%,40rem)] flex-col gap-2 rounded-2xl rounded-tl-md border border-error/40 bg-error/5 px-4 py-3">
                            <p className="flex items-center gap-2 text-sm text-error">
                              <TriangleAlert className="size-4 shrink-0" />
                              {m.error}
                            </p>
                            <div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRetry(m)}
                              >
                                <RotateCcw className="size-3.5" />
                                Reintentar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <ResultCard
                            result={m.result}
                            isActive={activeBudget?.id === m.result.budgetId}
                            onOpen={() =>
                              router.push(`/presupuestos/${m.result.budgetId}`)
                            }
                          />
                        )}
                      </li>
                    ),
                  )}
                </ul>
              </div>
              <div className="shrink-0 pt-3">{composerBody}</div>
              </>
            )}
          </div>
        </div>

        {/* Columna derecha: editor del borrador. Siempre presente y de tamaño
            fijo — solo su contenido interno scrollea, nunca la columna. */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden pr-2 xl:pl-4">
          <header className="flex shrink-0 items-center justify-end gap-2 pb-0.5">
            {activeBudget && (
              <span className="flex items-center gap-1">
                <Link
                  href={`/presupuestos/${activeBudget.id}`}
                  className="rounded-[var(--radius-md)] p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-primary"
                  title="Abrir en pantalla completa"
                  aria-label="Abrir en pantalla completa"
                >
                  <ExternalLink className="size-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setActiveBudget(null)}
                  className="rounded-[var(--radius-md)] p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text"
                  title="Cerrar borrador"
                  aria-label="Cerrar borrador"
                >
                  <X className="size-4" />
                </button>
              </span>
            )}
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-2 pb-6 pt-4">
            {!activeBudget && (
              <div className="mb-5 grid grid-cols-1 gap-4 border-b border-border pb-5 xl:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <input
                    ref={jsonFileRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    aria-hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) onArchivoJsonElegido(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => jsonFileRef.current?.click()}
                    className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-full)] border border-dashed border-[var(--brand-orange)]/50 bg-[var(--brand-orange)]/5 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--brand-orange)] transition-colors hover:bg-[var(--brand-orange)]/15"
                  >
                    <FileJson className="size-3.5" />
                    Subir (.json) · cargar propuesta
                  </button>
                  <p className="text-[10px] leading-snug text-text-muted">
                    O usá el cuadro de la derecha para pegar el mismo JSON.
                    Sin gastar tokens: todo se procesa en el navegador.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <label
                    htmlFor="generar-json-pegado"
                    className="text-[10px] font-black uppercase tracking-wider text-primary"
                  >
                    Pegar JSON del presupuesto
                  </label>
                  <textarea
                    id="generar-json-pegado"
                    value={jsonPegado}
                    onChange={(e) => setJsonPegado(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    placeholder="Pegá aquí el JSON completo."
                    className="min-h-[120px] w-full resize-y rounded-[var(--radius-lg)] border border-border bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed text-text shadow-inner outline-none placeholder:text-text-muted/60 focus:border-primary/60"
                  />
                  <div className="flex items-center justify-end gap-3">
                    {importError && (
                      <p className="text-[11px] font-medium text-error">{importError}</p>
                    )}
                    <Button
                      size="sm"
                      loading={importing}
                      disabled={!jsonPegado.trim()}
                      onClick={() => void handleImportJson(jsonPegado)}
                    >
                      Generar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <h2 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  activeBudget ? "animate-pulse bg-success" : "bg-text-muted/40",
                )}
                aria-hidden
              />
              Editor de presupuesto
            </h2>

            {activeBudget ? (
              <BudgetEditor key={activeBudget.id} budget={activeBudget} embedded />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <PencilLine className="size-6 text-text-muted/50" />
                <p className="max-w-[200px] text-sm text-text-muted">
                  Ingresá los detalles a la izquierda para que la IA redacte
                  la propuesta.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <ReglasIaModal
        open={reglasOpen}
        onClose={() => setReglasOpen(false)}
        industryPrompt={industryPrompt}
      />
      <PromptExternoModal
        open={promptExternoOpen}
        onClose={() => setPromptExternoOpen(false)}
        industryPrompt={industryPrompt}
      />
      <AyudaModal open={ayudaOpen} onClose={() => setAyudaOpen(false)} />
    </div>
  );
}

/** Burbuja de espera con fases rotativas del pipeline (RAG → inflación → LLM). */
function LoadingBubble(): React.ReactElement {
  const [fase, setFase] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setFase((f) => (f + 1) % FASES_GENERACION.length),
      2600,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-border bg-surface-elevated px-4 py-3">
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="size-1.5 animate-bounce rounded-full bg-primary"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      <span className="text-xs font-medium text-text-muted" aria-live="polite">
        {FASES_GENERACION[fase]}
      </span>
    </div>
  );
}

/** Tarjeta de presupuesto generado: total, trazabilidad RAG y acciones. */
function ResultCard({
  result,
  isActive,
  onOpen,
}: {
  result: GenerationResult;
  isActive: boolean;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "flex max-w-[min(100%,40rem)] flex-1 flex-col gap-3 rounded-2xl rounded-tl-md border bg-surface-elevated px-4 py-3.5 shadow-[var(--shadow-sm)]",
        isActive ? "border-primary/50" : "border-border",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-text-heading">
        <CircleCheck className="size-4 shrink-0 text-success" />
        {result.title}
      </p>
      {result.totalAmount !== null && (
        <p className="text-2xl font-bold tabular-nums tracking-tight text-text-heading">
          {formatMoney(result.totalAmount, result.currency)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={result.ragMode === "none" ? "warning" : "accent"}>
          {RAG_LABELS[result.ragMode]}
        </Badge>
        {result.sourceCount > 0 && (
          <Badge variant="neutral">
            <History className="mr-1 inline size-3" />
            {result.sourceCount}{" "}
            {result.sourceCount === 1 ? "histórico" : "históricos"}
          </Badge>
        )}
        {result.model && <Badge variant="neutral">{result.model}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {isActive ? (
          <span className="hidden items-center gap-1.5 text-xs font-medium text-primary xl:flex">
            <PencilLine className="size-3.5" />
            Editándose en el panel →
          </span>
        ) : null}
        <Button
          size="sm"
          variant={isActive ? "secondary" : "primary"}
          onClick={onOpen}
          className={cn(isActive && "xl:hidden")}
        >
          <PencilLine className="size-3.5" />
          Abrir en el editor
        </Button>
        <Link
          href={`/api/presupuestos/${result.budgetId}/export?formato=docx`}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface"
        >
          <FileText className="size-3.5" />
          Word
        </Link>
        <Link
          href={`/api/presupuestos/${result.budgetId}/export?formato=pdf`}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface"
        >
          <FileText className="size-3.5" />
          PDF
        </Link>
      </div>
    </div>
  );
}
