"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  Lightbulb,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { Button, Spinner, cn, useToast } from "@cotizaai/ui";
import { formatRelativeTime } from "@/lib/format";

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * Botón de abrir/cerrar el sidebar, en posición fija (igual abierto que
 * cerrado) para no tener que mover el mouse entre estados.
 */
export function ToggleSessionsSidebarButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? "Cerrar historial" : "Abrir historial"}
      aria-label={open ? "Cerrar historial" : "Abrir historial"}
      className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-text-muted transition-colors hover:bg-surface hover:text-text"
    >
      {open ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
    </button>
  );
}

/** Item de menú compacto del sidebar (ícono + label), estilo ITZA. */
function MenuItemSidebar({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs font-semibold transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-text hover:bg-surface",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Sidebar de historial de conversaciones del generador (tipo ChatGPT/Claude).
 * Carga la lista al montar y se actualiza en vivo cuando el padre informa que
 * autoguardó una sesión (sin esperar a un refetch).
 */
export function GeneratorSessionsSidebar({
  open,
  currentSessionId,
  lastSavedSession,
  onSelectSession,
  onNewChat,
  onSessionDeleted,
  onAbrirPromptExterno,
  onAbrirReglasIa,
  onAbrirAyuda,
  opcionesAbiertas,
  onToggleOpciones,
}: {
  open: boolean;
  currentSessionId: string | null;
  lastSavedSession: SessionSummary | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onSessionDeleted: (id: string) => void;
  onAbrirPromptExterno: () => void;
  onAbrirReglasIa: () => void;
  onAbrirAyuda: () => void;
  opcionesAbiertas: boolean;
  onToggleOpciones: () => void;
}): React.ReactElement | null {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/generador-sesiones")
      .then((res) => res.json())
      .then((json: { sessions?: SessionSummary[] }) => setSessions(json.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  // Derivado en render (no en efecto): mezcla la última sesión autoguardada
  // por el padre con la lista ya cargada, sin mantener dos fuentes de verdad.
  const displayedSessions =
    sessions === null
      ? null
      : lastSavedSession
        ? [
            lastSavedSession,
            ...sessions.filter((s) => s.id !== lastSavedSession.id),
          ]
        : sessions;

  async function handleDelete(id: string): Promise<void> {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/generador-sesiones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar la conversación.");
      setSessions((prev) => (prev ?? []).filter((s) => s.id !== id));
      onSessionDeleted(id);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col gap-2 overflow-hidden pt-10 transition-[width] duration-300 ease-in-out",
        open ? "w-56 border-r border-border pr-3" : "w-0 border-r-0 pr-0",
      )}
    >
      <Button variant="secondary" size="sm" onClick={onNewChat} className="justify-start">
        <MessageSquarePlus className="size-4" />
        Nuevo chat
      </Button>

      <div className="flex flex-col gap-0.5 border-b border-border pb-2">
        <MenuItemSidebar
          icon={<SquareArrowOutUpRight className="size-3.5 shrink-0" />}
          label="Prompt IA"
          onClick={onAbrirPromptExterno}
        />
        <MenuItemSidebar
          icon={<Settings className="size-3.5 shrink-0" />}
          label="Opciones avanzadas"
          active={opcionesAbiertas}
          onClick={onToggleOpciones}
        />
        <MenuItemSidebar
          icon={<Eye className="size-3.5 shrink-0" />}
          label="Reglas IA"
          onClick={onAbrirReglasIa}
        />
        <MenuItemSidebar
          icon={<Lightbulb className="size-3.5 shrink-0" />}
          label="Ayuda"
          onClick={onAbrirAyuda}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
          Recientes
        </p>
        {displayedSessions === null ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-4 text-text-muted" />
          </div>
        ) : displayedSessions.length === 0 ? (
          <p className="px-1 text-xs text-text-muted">Todavía no hay conversaciones.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {displayedSessions.map((s) => (
              <li key={s.id} className="group">
                <button
                  type="button"
                  onClick={() => onSelectSession(s.id)}
                  className={`flex w-full items-center justify-between gap-1 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs transition-colors ${
                    s.id === currentSessionId
                      ? "bg-primary/10 text-primary"
                      : "text-text hover:bg-surface"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block text-[10px] text-text-muted">
                      {formatRelativeTime(s.updatedAt)}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(s.id);
                    }}
                    aria-label="Eliminar conversación"
                    className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:text-error group-hover:opacity-100"
                  >
                    {deletingId === s.id ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
