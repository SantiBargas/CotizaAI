"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import type { BudgetTemplateConfig } from "@/types/budget-template";

export interface FormatoTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  config: BudgetTemplateConfig;
}

const EMPTY_CONFIG: BudgetTemplateConfig = {};

interface FormState {
  name: string;
  description: string;
  isDefault: boolean;
  config: BudgetTemplateConfig;
}

function toFormState(t?: FormatoTemplate): FormState {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    isDefault: t?.isDefault ?? false,
    config: t?.config ?? EMPTY_CONFIG,
  };
}

export function FormatosPanel({
  templates,
}: {
  templates: FormatoTemplate[];
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FormatoTemplate | null>(null);
  const [form, setForm] = useState<FormState>(toFormState());
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openCreate(): void {
    setEditing(null);
    setForm(toFormState());
    setOpen(true);
  }

  function openEdit(t: FormatoTemplate): void {
    setEditing(t);
    setForm(toFormState(t));
    setOpen(true);
  }

  function setConfig<K extends keyof BudgetTemplateConfig>(
    key: K,
    value: BudgetTemplateConfig[K],
  ): void {
    setForm((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value || undefined },
    }));
  }

  async function handleAnalyzeFile(file: File): Promise<void> {
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/formatos/analizar", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        name?: string;
        config?: BudgetTemplateConfig;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "No se pudo analizar el documento.");

      setEditing(null);
      setForm({
        name: json.name ?? "Formato importado",
        description: `Generado automáticamente a partir de ${file.name}.`,
        isDefault: false,
        config: json.config ?? {},
      });
      setOpen(true);
      toast("success", "Formato analizado. Revisá y guardá la plantilla.");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave(): Promise<void> {
    if (form.name.trim().length < 2) {
      toast("error", "Ponele un nombre a la plantilla.");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/formatos/${editing.id}` : "/api/formatos";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isDefault: form.isDefault,
          config: form.config,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo guardar la plantilla.");
      }
      toast("success", "Plantilla guardada.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: FormatoTemplate): Promise<void> {
    if (!confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
    try {
      const res = await fetch(`/api/formatos/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo eliminar la plantilla.");
      }
      toast("success", "Plantilla eliminada.");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nueva plantilla
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleAnalyzeFile(file);
          }}
        />
        <Button
          variant="secondary"
          loading={analyzing}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="size-4" />
          Analizar Word de referencia
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="Todavía no creaste formatos"
          description="Usá la plantilla por defecto, creá una nueva o subí un Word para que la IA proponga una configuración."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="truncate">{t.name}</CardTitle>
                {t.isDefault && (
                  <Badge variant="accent">
                    <Star className="size-3" />
                    Default
                  </Badge>
                )}
              </div>
              {t.description && (
                <p className="text-sm text-text-muted">{t.description}</p>
              )}
              <ul className="flex flex-col gap-1 text-xs text-text-muted">
                {t.config.documentTitlePrefix && (
                  <li>Prefijo: &quot;{t.config.documentTitlePrefix}&quot;</li>
                )}
                {t.config.totalLabel && (
                  <li>Etiqueta total: &quot;{t.config.totalLabel}&quot;</li>
                )}
                {t.config.headerNote && <li>Con nota de encabezado</li>}
                {t.config.showSignatures === false && (
                  <li>Sin bloque de firmas</li>
                )}
                {t.config.showLogo === false && <li>Sin logo</li>}
              </ul>
              <div className="mt-auto flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(t)}>
                  <Pencil className="size-3.5" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(t)}
                >
                  <Trash2 className="size-3.5 text-error" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title={editing ? "Editar plantilla" : "Nueva plantilla"}
        className="max-w-2xl"
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre">
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Presupuesto estándar, Licitación..."
              />
            </Field>
            <Field label="Descripción (opcional)">
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </Field>
          </div>

          <Field label="Prefijo del título (opcional)">
            <Input
              value={form.config.documentTitlePrefix ?? ""}
              onChange={(e) =>
                setConfig("documentTitlePrefix", e.target.value)
              }
              placeholder="Ej: LICITACIÓN — "
            />
          </Field>

          <Field label="Nota debajo del membrete (opcional)">
            <Textarea
              rows={3}
              value={form.config.headerNote ?? ""}
              onChange={(e) => setConfig("headerNote", e.target.value)}
              placeholder="Ej: aclaraciones legales, condiciones generales de la licitación..."
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Etiqueta de total">
              <Input
                value={form.config.totalLabel ?? ""}
                onChange={(e) => setConfig("totalLabel", e.target.value)}
                placeholder="Total cotizado"
              />
            </Field>
            <Field label="Etiqueta de forma de pago">
              <Input
                value={form.config.paymentLabel ?? ""}
                onChange={(e) => setConfig("paymentLabel", e.target.value)}
                placeholder="Forma de pago"
              />
            </Field>
            <Field label="Etiqueta de validez">
              <Input
                value={form.config.validityLabel ?? ""}
                onChange={(e) => setConfig("validityLabel", e.target.value)}
                placeholder="Validez de la oferta"
              />
            </Field>
          </div>

          <Field label="Texto de pie de página (opcional)">
            <Input
              value={form.config.footerText ?? ""}
              onChange={(e) => setConfig("footerText", e.target.value)}
              placeholder="Generado con CotizaAI"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Color primario (opcional)">
              <Input
                type="text"
                value={form.config.colorPrimary ?? ""}
                onChange={(e) => setConfig("colorPrimary", e.target.value)}
                placeholder="#005778"
              />
            </Field>
            <Field label="Color secundario (opcional)">
              <Input
                type="text"
                value={form.config.colorSecondary ?? ""}
                onChange={(e) => setConfig("colorSecondary", e.target.value)}
                placeholder="#008e97"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.config.showLogo ?? true}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    config: { ...p.config, showLogo: e.target.checked },
                  }))
                }
              />
              Mostrar el logo de la empresa
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.config.showSignatures ?? true}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    config: {
                      ...p.config,
                      showSignatures: e.target.checked,
                    },
                  }))
                }
              />
              Incluir bloque de firmas al final
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm((p) => ({ ...p, isDefault: e.target.checked }))
                }
              />
              Usar como formato por defecto
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void handleSave()}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
