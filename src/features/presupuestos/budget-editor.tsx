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
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import type { BudgetBlock, GeneratedBudgetPayload } from "@/types/budget";
import { BUDGET_STATUS_LABELS, type GeneratedBudgetDetail } from "./types";

/**
 * Editor de bloques del presupuesto generado. El usuario ajusta lo que produjo
 * la IA (textos, listas, tablas, imágenes, total) antes de marcarlo FINAL y
 * exportarlo. Reordenamiento por drag & drop (igual concepto que ITZA).
 */

type TextBlockType = "titulo" | "subtitulo" | "parrafo" | "lista" | "tabla";

const BLOCK_BADGE: Record<BudgetBlock["type"], "info" | "accent" | "neutral" | "success" | "warning"> = {
  titulo: "info",
  subtitulo: "accent",
  parrafo: "neutral",
  lista: "success",
  tabla: "warning",
  imagen: "info",
};

const IMAGEN_MAX_DIM = 800;

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!embedded && (
            <Link
              href="/presupuestos"
              className="rounded-[var(--radius-md)] p-2 text-text-muted hover:bg-surface hover:text-text"
              aria-label="Volver"
            >
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <div>
            <h1 className="text-xl font-bold text-text-heading">
              {payload.titulo}
            </h1>
            <Badge
              variant={budget.status === "FINAL" ? "success" : "warning"}
              className="mt-1"
            >
              {BUDGET_STATUS_LABELS[budget.status]}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && (
            <Select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-auto"
            >
              <option value="">
                Formato por defecto
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isDefault ? " (default)" : ""}
                </option>
              ))}
            </Select>
          )}
          <a
            href={`/api/presupuestos/${budget.id}/export?formato=docx${exportSuffix}`}
          >
            <Button variant="secondary">
              <FileDown className="size-4" />
              Word
            </Button>
          </a>
          <a
            href={`/api/presupuestos/${budget.id}/export?formato=pdf${exportSuffix}`}
          >
            <Button variant="secondary">
              <FileDown className="size-4" />
              PDF
            </Button>
          </a>
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

      <Card className="flex flex-col gap-4">
        <CardTitle>Datos generales</CardTitle>
        <Field label="Título">
          <Input
            value={payload.titulo}
            onChange={(e) =>
              setPayload((p) => ({ ...p, titulo: e.target.value }))
            }
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ubicación">
            <Input
              value={payload.ubicacion ?? ""}
              placeholder="Dirección o localidad del trabajo"
              onChange={(e) =>
                setPayload((p) => ({ ...p, ubicacion: e.target.value || null }))
              }
            />
          </Field>
          <Field label="Fecha">
            <Input
              type="date"
              value={payload.fecha ?? ""}
              onChange={(e) =>
                setPayload((p) => ({ ...p, fecha: e.target.value || null }))
              }
            />
          </Field>
          <Field label="Concepto">
            <Input
              value={payload.concepto ?? ""}
              placeholder="Resumen corto del servicio"
              onChange={(e) =>
                setPayload((p) => ({ ...p, concepto: e.target.value || null }))
              }
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Total">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={payload.cotizacionTotal ?? ""}
              onChange={(e) =>
                setPayload((p) => ({
                  ...p,
                  cotizacionTotal: e.target.value
                    ? Number(e.target.value)
                    : null,
                }))
              }
            />
          </Field>
          <Field label="Moneda">
            <Input
              value={payload.moneda}
              maxLength={3}
              onChange={(e) =>
                setPayload((p) => ({
                  ...p,
                  moneda: e.target.value.toUpperCase(),
                }))
              }
            />
          </Field>
          <Field label="Forma de pago">
            <Input
              value={payload.formaPago ?? ""}
              onChange={(e) =>
                setPayload((p) => ({
                  ...p,
                  formaPago: e.target.value || null,
                }))
              }
            />
          </Field>
          <Field label="Validez (días)">
            <Input
              type="number"
              min="0"
              value={payload.validezDias ?? ""}
              onChange={(e) =>
                setPayload((p) => ({
                  ...p,
                  validezDias: e.target.value
                    ? Math.round(Number(e.target.value))
                    : null,
                }))
              }
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-heading">
            Cuerpo del presupuesto
          </h2>
          <span className="text-xs text-text-muted">
            {payload.cuerpo.length} bloque(s) · arrastrá para reordenar
          </span>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="cuerpo">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex flex-col gap-2"
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

        <AddBlockToolbar
          onAddText={(type) => addTextBlock(type, payload.cuerpo.length)}
          onAddImage={(file) => void addImageBlock(file, payload.cuerpo.length)}
        />
      </div>
    </div>
  );
}

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
          <div className="flex w-full items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <div className="h-px flex-1 bg-border" />
            <span>cierre financiero detectado</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <AddBlockToolbar onAddText={onAddText} onAddImage={onAddImage} compact />
        </div>
      )}
      <Draggable draggableId={`block-${index}`} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`group relative flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-5 pl-9 shadow-[var(--shadow-sm)] ${
              snapshot.isDragging ? "shadow-[var(--shadow-md)] ring-1 ring-primary/40" : ""
            }`}
          >
            <div
              {...provided.dragHandleProps}
              className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab text-text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
              aria-label="Reordenar bloque"
            >
              <GripVertical className="size-4" />
            </div>
            <div className="flex items-center justify-between">
              <Badge variant={BLOCK_BADGE[block.type]}>{block.type}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                aria-label="Eliminar bloque"
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-4 text-error" />
              </Button>
            </div>
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
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/60 p-2 ${compact ? "" : "self-center"}`}
    >
      {!compact && (
        <span className="px-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
          Agregar
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={() => onAddText("titulo")}>
        Título
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onAddText("subtitulo")}>
        Subtítulo
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onAddText("parrafo")}>
        Párrafo
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onAddText("lista")}>
        Lista
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onAddText("tabla")}>
        Tabla
      </Button>
      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
        <ImageIcon className="size-3.5" />
        Imagen
      </Button>
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
    case "subtitulo":
      return (
        <Input
          value={block.texto}
          onChange={(e) => onChange({ ...block, texto: e.target.value })}
        />
      );
    case "parrafo":
      return (
        <Textarea
          value={block.texto}
          rows={3}
          onChange={(e) => onChange({ ...block, texto: e.target.value })}
        />
      );
    case "lista":
      return (
        <Field label="Ítems" hint="Uno por línea.">
          <Textarea
            value={block.items.join("\n")}
            rows={4}
            onChange={(e) =>
              onChange({
                ...block,
                items: e.target.value.split("\n").filter((s) => s.trim()),
              })
            }
          />
        </Field>
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
          <Input
            value={block.leyenda ?? ""}
            placeholder="Leyenda (opcional)"
            onChange={(e) => onChange({ ...block, leyenda: e.target.value || null })}
          />
        </div>
      );
  }
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
