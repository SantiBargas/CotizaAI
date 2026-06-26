"use client";

import { useLayoutEffect, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  CircleCheck,
  ExternalLink,
  FileText,
  History,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge, Button, cn, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { GeneratedBudgetPayload } from "@/types/budget";
import { BudgetEditor } from "@/features/presupuestos/budget-editor";
import type { GeneratedBudgetDetail } from "@/features/presupuestos/types";
import {
  GeneratorSessionsSidebar,
  ToggleSessionsSidebarButton,
  type SessionSummary,
} from "@/features/generar/generator-sessions-sidebar";

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

let nextId = 1;

export interface GenerarChatProps {
  nombre: string;
  frase: string;
  industry: string | null;
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
  usage,
  providers,
}: GenerarChatProps): React.ReactElement {
  const router = useRouter();
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
  const savingSessionRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const sugerencias: string[] = [
    industry
      ? `Presupuesto de ${industry} para un cliente nuevo: incluí materiales, mano de obra y plazos de entrega.`
      : "Presupuesto para instalación eléctrica completa de una casa de 120 m², con materiales y mano de obra.",
    "Cotización urgente con entrega en 15 días: detallá etapas, forma de pago y validez de la oferta.",
    "Rehacé el último trabajo que cotizamos pero para el doble de superficie, con precios actualizados a hoy.",
  ];

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

    try {
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          nivelDetalle: nivel,
          ...(provider && { provider }),
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

  function usarSugerencia(s: string): void {
    setInput(s);
    textareaRef.current?.focus();
  }

  const lastResult = [...messages]
    .reverse()
    .find(
      (m): m is Extract<ChatMessage, { state: "done" }> =>
        m.role === "assistant" && m.state === "done",
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra superior del generador */}
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <ToggleSessionsSidebarButton
            open={sidebarOpen}
            onClick={() => setSidebarOpen((o) => !o)}
          />
          <h1 className="shrink-0 text-xl font-bold tracking-tight text-text-heading">
            Generar
          </h1>
          {lastResult && (
            <span
              className="hidden min-w-0 items-center gap-1.5 truncate rounded-[var(--radius-full)] border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary sm:flex"
              title={`Se usó ${lastResult.result.model} · ${RAG_LABELS[lastResult.result.ragMode]}`}
            >
              <span
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                aria-hidden
              />
              <span className="truncate">
                Se usó: {lastResult.result.model} ·{" "}
                {RAG_LABELS[lastResult.result.ragMode]}
              </span>
            </span>
          )}
        </div>
        {!empty && (
          <Button
            variant="secondary"
            size="sm"
            disabled={generating}
            onClick={handleNewChat}
          >
            <Plus className="size-4" />
            Nueva conversación
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <GeneratorSessionsSidebar
          open={sidebarOpen}
          currentSessionId={sessionId}
          lastSavedSession={lastSavedSession}
          onSelectSession={(id) => void handleSelectSession(id)}
          onNewChat={handleNewChat}
          onSessionDeleted={handleSessionDeleted}
        />
        {/* Columna chat */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Hilo / estado vacío */}
          <div
            ref={scrollRef}
            className={cn(
              "relative min-h-0 flex-1 overflow-y-auto",
              empty && "flex items-center justify-center overflow-hidden",
            )}
          >
            {empty ? (
              <div className="relative flex w-full flex-col items-center px-4 text-center">
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]"
                  aria-hidden
                />
                <h2 className="relative bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                  {nombre
                    ? frase.replace("{nombre}", nombre)
                    : frase.replace(", {nombre}", "").replace("{nombre}", "")}
                </h2>
                <p className="relative mt-3 max-w-xl text-sm leading-6 text-text-muted">
                  Describí el trabajo a cotizar. Uso tus históricos ajustados
                  por inflación y el perfil de tu rubro para armar un
                  presupuesto listo para editar y exportar.
                </p>
                <div className="relative mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
                  {sugerencias.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => usarSugerencia(s)}
                      className="group rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-4 text-left text-sm leading-5 text-text shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-md)]"
                    >
                      <Sparkles className="mb-2 size-4 text-primary transition-transform group-hover:scale-110" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-5 pb-4 pr-1">
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
            )}
          </div>

          {/* Compositor */}
          <div className="shrink-0 pt-3">
            <div className="rounded-[1.4rem] border border-border bg-surface-elevated shadow-[var(--shadow-md)] transition-colors focus-within:border-primary/60">
              <div className="flex items-end gap-2 px-4 pt-3">
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
                  className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[var(--shadow-sm)] transition-all hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
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
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2.5 pt-2">
                <div className="flex flex-wrap items-center gap-2">
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
                  {providers.length > 1 && (
                    <Select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      disabled={generating}
                      className="h-7 w-auto py-0 text-[11px]"
                      aria-label="Proveedor de IA"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  )}
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
            </div>
            <p className="mt-2 text-center text-[11px] text-text-muted">
              Enter genera · Shift+Enter salto de línea · Cuanto más detalle
              des (alcance, cantidades, plazos), mejor sale.
            </p>
          </div>
        </div>

        {/* Panel derecho: editor del borrador (estilo constructor de ITZA) */}
        {activeBudget && (
          <aside className="hidden min-h-0 w-[30rem] shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-sm)] xl:flex 2xl:w-[34rem]">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted">
                <PencilLine className="size-3.5 text-primary" />
                Borrador generado
              </span>
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
                  title="Cerrar panel"
                  aria-label="Cerrar panel"
                >
                  <X className="size-4" />
                </button>
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <BudgetEditor
                key={activeBudget.id}
                budget={activeBudget}
                embedded
              />
            </div>
          </aside>
        )}
      </div>
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
