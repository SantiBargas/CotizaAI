"use client";

import { useHeaderSlotRef, useNavHidden } from "./nav-visibility";

/** Envuelve la fila completa del header (identidad · nav · acciones). Cuando
 *  un módulo pide ocultar el nav (setNavHidden(true)), la reemplaza por un
 *  slot vacío del mismo ancho/alto — el módulo porta ahí su propia barra de
 *  herramientas (ver useHeaderSlotEl), así queda "adentro" del header real. */
export function HeaderSlot({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const navHidden = useNavHidden();
  const slotRef = useHeaderSlotRef();

  if (navHidden) {
    return <div ref={slotRef} className="w-full" />;
  }
  return <>{children}</>;
}
