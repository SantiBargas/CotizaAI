"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Button, Field, Input, Modal, useToast } from "@cotizaai/ui";

/**
 * Zona de peligro: borra la organización completa (Clerk + Tenant local en
 * cascada). Solo se renderiza para OWNER (chequeo real en el server, esto es
 * solo para no mostrar el botón a quien no puede usarlo).
 */
export function DeleteOrganization({
  tenantName,
}: {
  tenantName: string;
}): React.ReactElement {
  const { setActive } = useClerk();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [loading, setLoading] = useState(false);

  const canConfirm = confirmacion === tenantName;

  function close(): void {
    if (loading) return;
    setOpen(false);
    setConfirmacion("");
  }

  async function handleDelete(): Promise<void> {
    if (!canConfirm) return;
    setLoading(true);
    try {
      const res = await fetch("/api/configuracion/cuenta", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo borrar la organización.");
      }
      // La sesión de Clerk todavía "recuerda" la organización borrada hasta
      // que se lo digamos explícitamente — si no, el header se queda
      // apuntando a algo que ya no existe.
      await setActive?.({ organization: null });
      toast("success", "Organización borrada.");
      // Navegación dura (no router.push): reinicia el cliente de Clerk desde
      // cero en vez de arrastrar cualquier estado en memoria de la
      // organización borrada.
      window.location.href = "/inicio";
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Error inesperado.",
      );
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Borrar organización
      </Button>

      <Modal open={open} onClose={close} title="Borrar organización">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text">
            Esto borra <strong>{tenantName}</strong> por completo: históricos,
            presupuestos generados, formatos, miembros y configuración. No se
            puede deshacer.
          </p>
          <Field
            label={`Escribí "${tenantName}" para confirmar`}
            htmlFor="confirmacion-borrado"
          >
            <Input
              id="confirmacion-borrado"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="off"
              disabled={loading}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={!canConfirm}
              loading={loading}
            >
              Borrar definitivamente
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
