"use client";

import { useState } from "react";
import { CalendarCheck, Send } from "lucide-react";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";

/**
 * CTA "Solicitar demo" de la landing: CotizaAI no tiene alta self-serve —
 * las cuentas las da de alta el equipo. El form guarda el lead en DB y avisa
 * por email (si Resend está configurado).
 */
export function DemoRequest({
  size = "md",
}: {
  size?: "md" | "lg";
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    empresa: "",
    mensaje: "",
    web: "", // honeypot
  });

  function set(key: keyof typeof form, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (form.nombre.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(form.email)) {
      setError("Completá tu nombre y un email válido.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          empresa: form.empresa.trim() || undefined,
          mensaje: form.mensaje.trim() || undefined,
          web: form.web,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo enviar la solicitud.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="accent" size={size} onClick={() => setOpen(true)}>
        <CalendarCheck className={size === "lg" ? "size-5" : "size-4"} />
        Solicitar demo
      </Button>

      <Modal
        open={open}
        onClose={() => !sending && setOpen(false)}
        title={sent ? "¡Solicitud enviada!" : "Solicitar una demo"}
      >
        {sent ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text">
              Gracias, {form.nombre.split(" ")[0]}. Te contactamos a la
              brevedad a <span className="font-medium">{form.email}</span>{" "}
              para coordinar la demo.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              Contanos quién sos y te mostramos CotizaAI funcionando con
              presupuestos de tu rubro.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre y apellido">
                <Input
                  value={form.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  disabled={sending}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  disabled={sending}
                />
              </Field>
            </div>
            <Field label="Empresa (opcional)">
              <Input
                value={form.empresa}
                onChange={(e) => set("empresa", e.target.value)}
                disabled={sending}
              />
            </Field>
            <Field label="¿Qué cotiza tu empresa? (opcional)">
              <Textarea
                rows={3}
                value={form.mensaje}
                onChange={(e) => set("mensaje", e.target.value)}
                disabled={sending}
              />
            </Field>
            {/* Honeypot anti-bots: invisible para humanos */}
            <input
              type="text"
              value={form.web}
              onChange={(e) => set("web", e.target.value)}
              className="sr-only"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
            />
            {error && <p className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                Cancelar
              </Button>
              <Button loading={sending} onClick={() => void handleSubmit()}>
                <Send className="size-4" />
                Enviar solicitud
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
