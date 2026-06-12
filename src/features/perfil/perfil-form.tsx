"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Plus, Save, Trash2, Upload } from "lucide-react";
import {
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import type { Signer } from "@/types/signer";

export interface PerfilData {
  industry: string;
  tone: string;
  defaultUnits: string;
  industryPrompt: string;
  logoUrl: string;
  colorPrimary: string;
  colorSecondary: string;
  companyData: {
    razonSocial?: string;
    cuit?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    web?: string;
  };
  signers: Signer[];
}

const MAX_SIGNERS = 6;
const MAX_FIRMA_BYTES = 300 * 1024; // 300 KB

/** Lee la imagen de firma: valida tipo/peso y obtiene dimensiones reales. */
function leerFirma(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      reject(new Error("La firma debe ser PNG o JPG."));
      return;
    }
    if (file.size > MAX_FIRMA_BYTES) {
      reject(new Error("La imagen de firma no puede superar 300 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("La imagen no es válida."));
      img.onload = () =>
        resolve({
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Perfil de empresa: el "ADN" del tenant. El `industryPrompt` es lo que más
 * pesa en la calidad de la generación; el branding se inyecta en los
 * documentos exportados.
 */
export function PerfilForm({
  initial,
  tenantName,
}: {
  initial: PerfilData;
  tenantName: string;
}): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<PerfilData>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PerfilData>(key: K, value: PerfilData[K]): void {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function setCompany(
    key: keyof PerfilData["companyData"],
    value: string,
  ): void {
    setData((prev) => ({
      ...prev,
      companyData: { ...prev.companyData, [key]: value },
    }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch("/api/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: data.industry || null,
          tone: data.tone || null,
          defaultUnits: data.defaultUnits || null,
          industryPrompt: data.industryPrompt || null,
          logoUrl: data.logoUrl || null,
          colorPrimary: data.colorPrimary || null,
          colorSecondary: data.colorSecondary || null,
          companyData: data.companyData,
          signers: data.signers,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo guardar el perfil.");
      }
      toast("success", "Perfil guardado.");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-heading">
            Perfil de {tenantName}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            El rubro y el tono guían a la IA; el branding aparece en los
            documentos exportados.
          </p>
        </div>
        <Button loading={saving} onClick={() => void handleSave()}>
          <Save className="size-4" />
          Guardar perfil
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <CardTitle>Rubro y estilo</CardTitle>
          <Field
            label="Rubro"
            hint='Ej: "instalaciones eléctricas", "imprenta", "organización de eventos".'
          >
            <Input
              value={data.industry}
              onChange={(e) => set("industry", e.target.value)}
            />
          </Field>
          <Field
            label="Tono de redacción"
            hint='Ej: "formal y técnico", "cercano pero profesional".'
          >
            <Input
              value={data.tone}
              onChange={(e) => set("tone", e.target.value)}
            />
          </Field>
          <Field
            label="Unidades habituales"
            hint='Ej: "m², horas, unidades, metros lineales".'
          >
            <Input
              value={data.defaultUnits}
              onChange={(e) => set("defaultUnits", e.target.value)}
            />
          </Field>
          <Field
            label="Perfil del rubro (prompt para la IA)"
            hint="Contale a la IA cómo trabaja tu empresa: qué incluye un presupuesto típico, cómo desglosás los ítems, qué aclaraciones nunca faltan. Cuanto mejor esté esto, mejores presupuestos."
          >
            <Textarea
              value={data.industryPrompt}
              onChange={(e) => set("industryPrompt", e.target.value)}
              rows={8}
            />
          </Field>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <CardTitle>Branding para documentos</CardTitle>
            <Field label="URL del logo" hint="PNG o JPG accesible por URL.">
              <Input
                value={data.logoUrl}
                placeholder="https://..."
                onChange={(e) => set("logoUrl", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Color primario" hint="Hex, ej #005778">
                <div className="flex items-center gap-2">
                  <Input
                    value={data.colorPrimary}
                    placeholder="#005778"
                    onChange={(e) => set("colorPrimary", e.target.value)}
                  />
                  <span
                    className="inline-block size-8 shrink-0 rounded-[var(--radius-sm)] border border-border"
                    style={{
                      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(
                        data.colorPrimary,
                      )
                        ? data.colorPrimary
                        : "transparent",
                    }}
                  />
                </div>
              </Field>
              <Field label="Color secundario" hint="Hex, ej #008e97">
                <div className="flex items-center gap-2">
                  <Input
                    value={data.colorSecondary}
                    placeholder="#008e97"
                    onChange={(e) => set("colorSecondary", e.target.value)}
                  />
                  <span
                    className="inline-block size-8 shrink-0 rounded-[var(--radius-sm)] border border-border"
                    style={{
                      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(
                        data.colorSecondary,
                      )
                        ? data.colorSecondary
                        : "transparent",
                    }}
                  />
                </div>
              </Field>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Datos de la empresa (membrete)</CardTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Razón social">
                <Input
                  value={data.companyData.razonSocial ?? ""}
                  onChange={(e) => setCompany("razonSocial", e.target.value)}
                />
              </Field>
              <Field label="CUIT">
                <Input
                  value={data.companyData.cuit ?? ""}
                  onChange={(e) => setCompany("cuit", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Dirección">
              <Input
                value={data.companyData.direccion ?? ""}
                onChange={(e) => setCompany("direccion", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Teléfono">
                <Input
                  value={data.companyData.telefono ?? ""}
                  onChange={(e) => setCompany("telefono", e.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={data.companyData.email ?? ""}
                  onChange={(e) => setCompany("email", e.target.value)}
                />
              </Field>
              <Field label="Web">
                <Input
                  value={data.companyData.web ?? ""}
                  onChange={(e) => setCompany("web", e.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <FirmantesCard
        signers={data.signers}
        onChange={(signers) => set("signers", signers)}
      />
    </div>
  );
}

/**
 * Firmantes de los documentos (idea heredada de ITZA: "Agregar profesional").
 * La IA nunca genera firmas; estos firmantes se insertan al final del Word/PDF
 * exportado (imagen de firma + nombre + cargo, hasta 3 por fila).
 */
function FirmantesCard({
  signers,
  onChange,
}: {
  signers: Signer[];
  onChange: (signers: Signer[]) => void;
}): React.ReactElement {
  const { toast } = useToast();

  function update(id: string, patch: Partial<Signer>): void {
    onChange(signers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function add(): void {
    onChange([
      ...signers,
      { id: crypto.randomUUID(), nombre: "", cargo: null, firma: null },
    ]);
  }

  async function subirFirma(id: string, file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const firma = await leerFirma(file);
      update(id, { firma });
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Firmantes de los documentos</CardTitle>
          <p className="mt-1 text-sm text-text-muted">
            Se insertan al final del Word/PDF exportado (la IA nunca inventa
            firmas). Subí la firma escaneada en PNG/JPG con fondo transparente
            o blanco.
          </p>
        </div>
        {signers.length < MAX_SIGNERS && (
          <Button variant="secondary" size="sm" onClick={add}>
            <Plus className="size-4" />
            Agregar firmante
          </Button>
        )}
      </div>

      {signers.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          Sin firmantes: los documentos cierran sin bloque de firma.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {signers.map((s) => (
            <SignerRow
              key={s.id}
              signer={s}
              onUpdate={(patch) => update(s.id, patch)}
              onUpload={(file) => void subirFirma(s.id, file)}
              onRemove={() =>
                onChange(signers.filter((x) => x.id !== s.id))
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SignerRow({
  signer,
  onUpdate,
  onUpload,
  onRemove,
}: {
  signer: Signer;
  onUpdate: (patch: Partial<Signer>) => void;
  onUpload: (file: File | undefined) => void;
  onRemove: () => void;
}): React.ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <PenLine className="size-3.5 text-primary" />
          Firmante
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label="Quitar firmante"
        >
          <Trash2 className="size-4 text-error" />
        </Button>
      </div>

      <Field label="Nombre y apellido">
        <Input
          value={signer.nombre}
          placeholder="Ej: Ing. Juan Pérez"
          onChange={(e) => onUpdate({ nombre: e.target.value })}
        />
      </Field>
      <Field label="Cargo / matrícula" hint="Opcional. Ej: Director técnico · MP 1234">
        <Input
          value={signer.cargo ?? ""}
          onChange={(e) => onUpdate({ cargo: e.target.value || null })}
        />
      </Field>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          onUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {signer.firma ? (
        <div className="flex items-center gap-3">
          {/* data URL local: next/image no aplica acá */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signer.firma.dataUrl}
            alt={`Firma de ${signer.nombre || "firmante"}`}
            className="h-14 max-w-40 rounded-[var(--radius-sm)] border border-border bg-white object-contain px-2"
          />
          <div className="flex flex-col gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Cambiar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate({ firma: null })}
            >
              Quitar imagen
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Subir imagen de firma
        </Button>
      )}
    </li>
  );
}
