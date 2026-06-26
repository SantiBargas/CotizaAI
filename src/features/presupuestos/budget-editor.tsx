"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  FileDown,
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
 * la IA (textos, listas, tablas, total) antes de marcarlo FINAL y exportarlo.
 */
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

  function moveBlock(index: number, dir: -1 | 1): void {
    setPayload((prev) => {
      const next = [...prev.cuerpo];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, cuerpo: next };
    });
  }

  function addBlock(type: BudgetBlock["type"]): void {
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
    setPayload((prev) => ({ ...prev, cuerpo: [...prev.cuerpo, block] }));
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

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-heading">
            Cuerpo del presupuesto
          </h2>
          <AddBlockMenu onAdd={addBlock} />
        </div>

        {payload.cuerpo.map((block, i) => (
          <Card key={i} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Badge variant="info">{block.type}</Badge>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveBlock(i, -1)}
                  aria-label="Subir"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveBlock(i, 1)}
                  aria-label="Bajar"
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeBlock(i)}
                  aria-label="Eliminar bloque"
                >
                  <Trash2 className="size-4 text-error" />
                </Button>
              </div>
            </div>
            <BlockEditor
              block={block}
              onChange={(b) => updateBlock(i, b)}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

function AddBlockMenu({
  onAdd,
}: {
  onAdd: (type: BudgetBlock["type"]) => void;
}): React.ReactElement {
  const [type, setType] = useState<BudgetBlock["type"]>("parrafo");
  return (
    <div className="flex items-center gap-2">
      <Select
        value={type}
        onChange={(e) => setType(e.target.value as BudgetBlock["type"])}
        className="w-36"
      >
        <option value="titulo">Título</option>
        <option value="subtitulo">Subtítulo</option>
        <option value="parrafo">Párrafo</option>
        <option value="lista">Lista</option>
        <option value="tabla">Tabla</option>
      </Select>
      <Button variant="secondary" size="sm" onClick={() => onAdd(type)}>
        <Plus className="size-4" />
        Agregar bloque
      </Button>
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
