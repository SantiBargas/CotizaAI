"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOrganization } from "@clerk/nextjs";

/**
 * Fuerza una invalidación completa del caché del cliente (router.refresh())
 * cuando cambia la organización activa — a diferencia de un refresh
 * periódico, acá SÍ queremos tirar todo: cualquier página que hayas
 * visitado con la organización anterior podría mostrar datos de OTRO tenant
 * si el caché sobrevive al cambio (regla de oro: nunca cruzar tenants).
 * Dispara solo en el cambio real, no en el montaje inicial.
 */
export function OrgSwitchRevalidate(): null {
  const { organization } = useOrganization();
  const router = useRouter();
  const prevOrgIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const orgId = organization?.id ?? null;
    if (prevOrgIdRef.current === undefined) {
      prevOrgIdRef.current = orgId;
      return;
    }
    if (prevOrgIdRef.current !== orgId) {
      prevOrgIdRef.current = orgId;
      router.refresh();
    }
  }, [organization?.id, router]);

  return null;
}
