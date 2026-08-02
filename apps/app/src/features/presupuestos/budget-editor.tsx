"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ArrowLeft,
  CheckCircle2,
  FileDown,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Button, Input, Select, useToast } from "@cotizaai/ui";
import type { BudgetBlock, GeneratedBudgetPayload } from "@/types/budget";
import { BUDGET_STATUS_LABELS, type GeneratedBudgetDetail } from "./types";

/**
 * Editor de bloques del presupuesto generado, con la estética del constructor
 * de ITZA adaptada al design system de CotizaAI: edición inline (inputs
 * transparentes con subrayado), toolbar "Agregar" tipo píldora, cotización
 * total como tarjeta destacada y botonera de exportación grande al pie.
 * Reordenamiento por drag & drop.
 */

type TextBlockType = "titulo" | "subtitulo" | "parrafo" | "lista" | "tabla";

const IMAGEN_MAX_DIM = 800;

/** Input inline estilo ITZA: transparente, subrayado al hover/focus. */
const INLINE_INPUT =
  "w-full bg-transparent border-b border-transparent hover:border-border focus:border-[var(--brand-aqua)]/60 outline-none transition-colors";

/** Lee un archivo de imagen, lo redimensiona client-side (máx 800x800
 *  manteniendo proporción) y devuelve el data URL + dimensiones reales. */
function leerImagenBloque(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      reject(new Error("La imagen debe ser PNG o JPG."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("La imagen no es válida."));
      img.onload = () => {
        let { width, height } = img;
        if (width > IMAGEN_MAX_DIM) {
          height = Math.round((height * IMAGEN_MAX_DIM) / width);
          width = IMAGEN_MAX_DIM;
        }
        if (height > IMAGEN_MAX_DIM) {
          width = Math.round((width * IMAGEN_MAX_DIM) / height);
          height = IMAGEN_MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl =
          file.type === "image/png"
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", 0.85);
        resolve({ dataUrl, width, height });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Heurístico heredado de ITZA: detecta el bloque donde suele empezar el
 *  cierre financiero, para ofrecer ahí mismo una botonera de inserción y no
 *  obligar a scrollear hasta el final al armar la sección de pago. */
const PALABRAS_CIERRE = ["valor", "cotiz", "honorari", "forma de pago", "condicion", "condición"];

function indiceCierreFinanciero(cuerpo: BudgetBlock[]): number {
  return cuerpo.findIndex(
    (b) =>
      (b.type === "titulo" || b.type === "subtitulo") &&
      PALABRAS_CIERRE.some((p) => b.texto.toLowerCase().includes(p)),
  );
}

export function BudgetEditor({
  budget,
  embedded = false,
}: {
  budget: GeneratedBudgetDetail;
  /** true cuando vive en el panel del generador (sin link "volver"). */
  embedded?: boolean;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [payload, setPayload] = useState<GeneratedBudgetPayload>(
    budget.content,
  );
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [templates, setTemplates] = useState<
    { id: string; name: string; isDefault: boolean }[]
  >([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    fetch("/api/formatos")
      .then((res) => res.json())
      .then((json: { templates?: typeof templates }) => {
        setTemplates(json.templates ?? []);
      })
      .catch(() => undefined);
  }, []);

  const exportSuffix = templateId ? `&templateId=${templateId}` : "";

  function updateBlock(index: number, block: BudgetBlock): void {
    setPayload((prev) => ({
      ...prev,
      cuerpo: prev.cuerpo.map((b, i) => (i === index ? block : b)),
    }));
  }

  function removeBlock(index: number): void {
    setPayload((prev) => ({
      ...prev,
      cuerpo: prev.cuerpo.filter((_, i) => i !== index),
    }));
  }

  function insertBlockAt(index: number, block: BudgetBlock): void {
    setPayload((prev) => {
      const cuerpo = [...prev.cuerpo];
      cuerpo.splice(index, 0, block);
      return { ...prev, cuerpo };
    });
  }

  function addTextBlock(type: TextBlockType, index: number): void {
    const block: BudgetBlock =
      type === "lista"
        ? { type: "lista", items: ["Nuevo ítem"] }
        : type === "tabla"
          ? {
              type: "tabla",
              encabezados: ["Ítem", "Cantidad", "Precio"],
              filas: [["", "", ""]],
            }
          : { type, texto: "" };
    insertBlockAt(index, block);
  }

  async function addImageBlock(file: File, index: number): Promise<void> {
    try {
      const { dataUrl, width, height } = await leerImagenBloque(file);
      insertBlockAt(index, { type: "imagen", base64: dataUrl, width, height, leyenda: null });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "No se pudo cargar la imagen.");
    }
  }

  function handleDragEnd(result: DropResult): void {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    setPayload((prev) => {
      const cuerpo = [...prev.cuerpo];
      const [moved] = cuerpo.splice(from, 1);
      cuerpo.splice(to, 0, moved);
      return { ...prev, cuerpo };
    });
  }

  async function persist(
    status?: "DRAFT" | "FINAL",
  ): Promise<boolean> {
    const res = await fetch(`/api/presupuestos/${budget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: payload, ...(status && { status }) }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      toast("error", json.error ?? "No se pudo guardar.");
      return false;
    }
    return true;
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    if (await persist()) {
      toast("success", "Presupuesto guardado.");
      router.refresh();
    }
    setSaving(false);
  }

  async function handleFinalize(): Promise<void> {
    setFinalizing(true);
    if (await persist("FINAL")) {
      toast("success", "Presupuesto marcado como FINAL. Listo para exportar.");
      router.refresh();
    }
    setFinalizing(false);
  }

  const idxCierre = indiceCierreFinanciero(payload.cuerpo);

  return (
    <div className="flex flex-col">
      {/* ── Barra superior compacta: volver + estado + formato + guardar/final ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!embedded && (
            <Link
              href="/presupuestos"
              className="rounded-[var(--radius-md)] p-2 text-text-muted hover:bg-surface hover:text-text"
              aria-label="Volver"
            >
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <Badge variant={budget.status === "FINAL" ? "success" : "warning"}>
            {BUDGET_STATUS_LABELS[budget.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && (
            <Select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-auto"
            >
              <option value="">Formato por defecto</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isDefault ? " (default)" : ""}
                </option>
              ))}
            </Select>
          )}
          <Button
            variant="secondary"
            loading={saving}
            onClick={() => void handleSave()}
          >
            <Save className="size-4" />
            Guardar
          </Button>
          {budget.status === "DRAFT" && (
            <Button loading={finalizing} onClick={() => void handleFinalize()}>
              <CheckCircle2 className="size-4" />
              Marcar FINAL
            </Button>
          )}
        </div>
      </div>

      {/* ── Título del documento — inline grande estilo ITZA ── */}
      <div className="mb-6">
        <label className="pl-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Título del documento
        </label>
        <input
          type="text"
          value={payload.titulo}
          onChange={(e) => setPayload((p) => ({ ...p, titulo: e.target.value }))}
          placeholder="Título aquí…"
          className={`${INLINE_INPUT} border-b-2 py-2 text-2xl font-black text-text-heading placeholder:text-text-muted/40`}
        />
      </div>

      {/* ── Ubicación / Fecha / Concepto — grid inline ── */}
      <div className="mb-6 grid grid-cols-1 gap-5 border-b border-border/60 pb-7 sm:grid-cols-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Ubicación
          </label>
          <input
            type="text"
            value={payload.ubicacion ?? ""}
            placeholder="Dirección o localidad"
            onChange={(e) =>
              setPayload((p) => ({ ...p, ubicacion: e.target.value || null }))
            }
            className={`${INLINE_INPUT} mt-1 text-sm font-semibold text-text`}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Fecha
          </label>
          <div className="mt-1 flex w-full items-center border-b border-transparent transition-colors focus-within:border-[var(--brand-aqua)]/60 hover:border-border">
            <input
              type="date"
              value={payload.fecha ?? ""}
              onChange={(e) =>
                setPayload((p) => ({ ...p, fecha: e.target.value || null }))
              }
              className="w-full bg-transparent text-sm font-semibold text-text outline-none [color-scheme:light_dark]"
            />
            {payload.fecha && (
              <button
                type="button"
                onClick={() => setPayload((p) => ({ ...p, fecha: null }))}
                className="px-2 text-lg font-bold leading-none text-error/60 transition-colors hover:text-error"
                aria-label="Quitar fecha"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Concepto
          </label>
          <input
            type="text"
            value={payload.concepto ?? ""}
            placeholder="Resumen corto del servicio"
            onChange={(e) =>
              setPayload((p) => ({ ...p, concepto: e.target.value || null }))
            }
            className={`${INLINE_INPUT} mt-1 text-sm font-semibold text-text`}
          />
        </div>
      </div>

      {/* ── Cuerpo (bloques con drag & drop) ── */}
      <div className="flex flex-col gap-1">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="cuerpo">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-col gap-1"
              >
                {payload.cuerpo.map((block, i) => (
                  <BlockRow
                    key={`block-${i}`}
                    block={block}
                    index={i}
                    showInsertBefore={i === idxCierre}
                    onChange={(b) => updateBlock(i, b)}
                    onRemove={() => removeBlock(i)}
                    onAddText={(type) => addTextBlock(type, i)}
                    onAddImage={(file) => void addImageBlock(file, i)}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="mt-4 self-center">
          <AddBlockToolbar
            onAddText={(type) => addTextBlock(type, payload.cuerpo.length)}
            onAddImage={(file) => void addImageBlock(file, payload.cuerpo.length)}
          />
        </div>
      </div>

      {/* ── Cierre financiero: cotización total + validez + forma de pago ── */}
      <div className="mt-8 flex flex-col items-end gap-2 border-t border-border/60 pt-6">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brand-orange)]">
          Cotización total
        </span>
        <div className="flex items-baseline gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-elevated px-6 py-4 shadow-[var(--shadow-md)]">
          <span className="text-lg font-bold text-text-muted">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={payload.cotizacionTotal ?? ""}
            placeholder="0"
            onChange={(e) =>
              setPayload((p) => ({
                ...p,
                cotizacionTotal: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className="w-44 bg-transparent text-right text-3xl font-black text-text-heading outline-none [appearance:textfield] placeholder:text-text-muted/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <input
            type="text"
            value={payload.moneda}
            maxLength={3}
            onChange={(e) =>
              setPayload((p) => ({ ...p, moneda: e.target.value.toUpperCase() }))
            }
            className="w-12 bg-transparent text-xs font-black uppercase tracking-wider text-text-muted outline-none"
            aria-label="Moneda"
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <span className="font-bold uppercase tracking-widest text-[10px]">
            Validez de la oferta:
          </span>
          <input
            type="number"
            min="0"
            value={payload.validezDias ?? ""}
            placeholder="30"
            onChange={(e) =>
              setPayload((p) => ({
                ...p,
                validezDias: e.target.value
                  ? Math.round(Number(e.target.value))
                  : null,
              }))
            }
            className="w-12 border-b border-transparent bg-transparent text-center font-semibold italic text-text outline-none transition-colors [appearance:textfield] hover:border-border focus:border-[var(--brand-aqua)]/60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="italic">días corridos</span>
          {payload.validezDias != null && (
            <button
              type="button"
              onClick={() => setPayload((p) => ({ ...p, validezDias: null }))}
              className="text-error/60 transition-colors hover:text-error"
              aria-label="Quitar validez"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <div className="flex w-full max-w-sm items-center gap-2 self-end">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Forma de pago
          </span>
          <input
            type="text"
            value={payload.formaPago ?? ""}
            placeholder="Ej.: 50% anticipo, 50% contra entrega"
            onChange={(e) =>
              setPayload((p) => ({ ...p, formaPago: e.target.value || null }))
            }
            className={`${INLINE_INPUT} text-right text-[12px] font-semibold text-text`}
          />
        </div>
      </div>

      {/* ── Botonera de exportación grande (estilo ITZA) ── */}
      <div className="mt-8 flex w-full flex-col gap-2">
        <div className="flex gap-2">
          <a
            href={`/api/presupuestos/${budget.id}/export?formato=docx${exportSuffix}`}
            className="flex flex-1 items-center justify-center gap-3 rounded-[calc(var(--radius-lg)+4px)] bg-[var(--brand-aqua)] py-4 text-xs font-black uppercase tracking-widest text-white shadow-[var(--shadow-lg)] transition-all hover:scale-[1.01] hover:bg-[var(--brand-aqua-700)] active:scale-[0.98]"
          >
            <FileDown className="size-5 shrink-0" />
            Descargar (.docx)
          </a>
          <a
            href={`/api/presupuestos/${budget.id}/export?formato=pdf${exportSuffix}`}
            className="flex flex-1 items-center justify-center gap-3 rounded-[calc(var(--radius-lg)+4px)] bg-[var(--brand-blue)] py-4 text-xs font-black uppercase tracking-widest text-white shadow-[var(--shadow-lg)] transition-all hover:scale-[1.01] hover:bg-[var(--brand-blue-900)] active:scale-[0.98]"
          >
            <FileDown className="size-5 shrink-0" />
            Descargar (PDF)
          </a>
        </div>
        <p className="text-center text-[9px] font-medium text-text-muted">
          Revisá antes de enviar · los firmantes configurados en Perfil se insertan al exportar
        </p>
      </div>
    </div>
  );
}

/** Etiqueta corta del tipo de bloque (visible solo al hover, estilo ITZA). */
const BLOCK_LABEL: Record<BudgetBlock["type"], string> = {
  titulo: "Título",
  subtitulo: "Subtít",
  parrafo: "Párrafo",
  lista: "Lista",
  tabla: "Tabla",
  imagen: "Foto",
};

function BlockRow({
  block,
  index,
  showInsertBefore,
  onChange,
  onRemove,
  onAddText,
  onAddImage,
}: {
  block: BudgetBlock;
  index: number;
  showInsertBefore: boolean;
  onChange: (block: BudgetBlock) => void;
  onRemove: () => void;
  onAddText: (type: TextBlockType) => void;
  onAddImage: (file: File) => void;
}): React.ReactElement {
  return (
    <>
      {showInsertBefore && (
        <div className="flex flex-col items-center gap-1.5 py-1">
          <div className="flex w-full items-center gap-2 text-[9px] font-semibold uppercase tracking-wide text-text-muted/70">
            <div className="h-px flex-1 bg-border/60" />
            <span>cierre financiero detectado</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <AddBlockToolbar onAddText={onAddText} onAddImage={onAddImage} compact />
        </div>
      )}
      <Draggable draggableId={`block-${index}`} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`group relative rounded-[var(--radius-md)] border py-1.5 pl-8 pr-8 transition-colors ${
              snapshot.isDragging
                ? "border-[var(--brand-aqua)]/40 bg-surface-elevated shadow-[var(--shadow-md)]"
                : "border-transparent hover:border-border/70 hover:bg-surface/50"
            }`}
          >
            <div
              {...provided.dragHandleProps}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab text-text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
              aria-label="Reordenar bloque"
            >
              <GripVertical className="size-4" />
            </div>
            <span className="pointer-events-none absolute -top-2 left-8 rounded bg-surface-elevated px-1.5 text-[8px] font-black uppercase tracking-wider text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
              {BLOCK_LABEL[block.type]}
            </span>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Eliminar bloque"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-error/70 opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
            <BlockEditor block={block} onChange={onChange} />
          </div>
        )}
      </Draggable>
    </>
  );
}

function AddBlockToolbar({
  onAddText,
  onAddImage,
  compact = false,
}: {
  onAddText: (type: TextBlockType) => void;
  onAddImage: (file: File) => void;
  compact?: boolean;
}): React.ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const chip =
    "rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-text-muted transition-colors hover:bg-[var(--brand-aqua)]/10 hover:text-[var(--brand-aqua)]";
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-0.5 rounded-full border border-border bg-surface-elevated px-2 py-1 shadow-[var(--shadow-sm)] ${compact ? "scale-90" : ""}`}
    >
      <span className="px-2 text-[10px] font-black uppercase tracking-widest text-text-muted/60">
        Agregar
      </span>
      <button type="button" className={chip} onClick={() => onAddText("titulo")}>
        <span className="mr-1 text-[var(--brand-aqua)]">T</span>Título
      </button>
      <button type="button" className={chip} onClick={() => onAddText("subtitulo")}>
        <span className="mr-1 text-[var(--brand-orange)]">S</span>Subtít
      </button>
      <button type="button" className={chip} onClick={() => onAddText("parrafo")}>
        <span className="mr-1 text-[var(--brand-blue)]">¶</span>Párrafo
      </button>
      <button type="button" className={chip} onClick={() => onAddText("lista")}>
        <span className="mr-1 text-[var(--brand-aqua)]">≡</span>Lista
      </button>
      <button type="button" className={chip} onClick={() => onAddText("tabla")}>
        <span className="mr-1 text-[var(--brand-blue)]">⊞</span>Tabla
      </button>
      <button type="button" className={chip} onClick={() => fileRef.current?.click()}>
        <ImageIcon className="mr-1 inline size-3" />Foto
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onAddImage(file);
        }}
      />
    </div>
  );
}

function BlockEditor({
  block,
  onChange,
}: {
  block: BudgetBlock;
  onChange: (block: BudgetBlock) => void;
}): React.ReactElement {
  switch (block.type) {
    case "titulo":
      return (
        <input
          value={block.texto}
          placeholder="Título de sección…"
          onChange={(e) => onChange({ ...block, texto: e.target.value })}
          className={`${INLINE_INPUT} py-1 text-lg font-black uppercase tracking-wide text-[var(--brand-blue)] placeholder:normal-case placeholder:text-text-muted/40 dark:text-[var(--brand-aqua)]`}
        />
      );
    case "subtitulo":
      return (
        <input
          value={block.texto}
          placeholder="Subtítulo…"
          onChange={(e) => onChange({ ...block, texto: e.target.value })}
          className={`${INLINE_INPUT} py-1 text-[15px] font-bold text-text-heading placeholder:text-text-muted/40`}
        />
      );
    case "parrafo":
      return (
        <AutoTextarea
          value={block.texto}
          placeholder="Escribí el párrafo…"
          onChange={(texto) => onChange({ ...block, texto })}
        />
      );
    case "lista":
      return (
        <div className="flex gap-2">
          <span className="mt-1 shrink-0 select-none text-[var(--brand-aqua)]">•</span>
          <AutoTextarea
            value={block.items.join("\n")}
            placeholder="Un ítem por línea…"
            onChange={(v) =>
              onChange({ ...block, items: v.split("\n").filter((s) => s.trim()) })
            }
          />
        </div>
      );
    case "tabla":
      return <TableBlockEditor block={block} onChange={onChange} />;
    case "imagen":
      return (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no aplica next/image */}
          <img
            src={block.base64}
            alt=""
            className="max-h-56 w-auto self-center rounded-[var(--radius-md)] border border-border object-contain"
          />
          <input
            value={block.leyenda ?? ""}
            placeholder="Leyenda (opcional)"
            onChange={(e) => onChange({ ...block, leyenda: e.target.value || null })}
            className={`${INLINE_INPUT} text-center text-[11px] italic text-text-muted`}
          />
        </div>
      );
  }
}

/** Textarea transparente que crece con el contenido (edición inline). */
function AutoTextarea({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none overflow-hidden border-b border-transparent bg-transparent text-sm leading-relaxed text-text outline-none transition-colors placeholder:text-text-muted/40 hover:border-border focus:border-[var(--brand-aqua)]/60"
    />
  );
}

function TableBlockEditor({
  block,
  onChange,
}: {
  block: Extract<BudgetBlock, { type: "tabla" }>;
  onChange: (block: BudgetBlock) => void;
}): React.ReactElement {
  const cols = block.encabezados.length;

  function setHeader(j: number, value: string): void {
    const encabezados = block.encabezados.map((h, idx) =>
      idx === j ? value : h,
    );
    onChange({ ...block, encabezados });
  }

  function setCell(i: number, j: number, value: string): void {
    const filas = block.filas.map((row, ri) =>
      ri === i ? row.map((c, ci) => (ci === j ? value : c)) : row,
    );
    onChange({ ...block, filas });
  }

  function addRow(): void {
    onChange({ ...block, filas: [...block.filas, Array(cols).fill("")] });
  }

  function removeRow(i: number): void {
    onChange({ ...block, filas: block.filas.filter((_, ri) => ri !== i) });
  }

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(120px, 1fr)) 40px` }}
      >
        {block.encabezados.map((h, j) => (
          <Input
            key={`h-${j}`}
            value={h}
            className="font-medium"
            onChange={(e) => setHeader(j, e.target.value)}
          />
        ))}
        <span />
        {block.filas.map((row, i) => (
          <FilaCells
            key={`r-${i}`}
            row={row}
            cols={cols}
            onCell={(j, v) => setCell(i, j, v)}
            onRemove={() => removeRow(i)}
          />
        ))}
      </div>
      <div>
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          Fila
        </Button>
      </div>
    </div>
  );
}

function FilaCells({
  row,
  cols,
  onCell,
  onRemove,
}: {
  row: string[];
  cols: number;
  onCell: (j: number, value: string) => void;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <>
      {Array.from({ length: cols }).map((_, j) => (
        <Input
          key={j}
          value={row[j] ?? ""}
          onChange={(e) => onCell(j, e.target.value)}
        />
      ))}
      <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Quitar fila">
        <Trash2 className="size-4 text-error" />
      </Button>
    </>
  );
}
