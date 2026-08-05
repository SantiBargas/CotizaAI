"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Store mínimo (pub-sub, sin Context) para que una pantalla admin "de
 * pantalla completa" reemplace el header principal por su propia barra de
 * herramientas — mismo patrón que useNavVisibility de ITZA. Module-level a
 * propósito: el header vive en (app)/layout.tsx, lejos en el árbol de la
 * pantalla que necesita reemplazarlo, así que un Context tendría que envolver
 * toda la app para una necesidad puntual de una sola pantalla.
 *
 * `navHidden` decide si el header muestra el nav normal o el slot vacío;
 * `slotEl` es el nodo DOM de ese slot, para que la pantalla porte (createPortal)
 * su propia barra ahí — así la barra queda "adentro" del header real (mismo
 * fondo, mismo sticky, mismo ancho), no una card aparte más abajo en la página.
 */
let navHidden = false;
const navListeners = new Set<() => void>();

let slotEl: HTMLDivElement | null = null;
const slotListeners = new Set<() => void>();

export function setNavHidden(value: boolean): void {
  if (navHidden === value) return;
  navHidden = value;
  navListeners.forEach((fn) => fn());
}

export function useNavHidden(): boolean {
  const [isHidden, setIsHidden] = useState(navHidden);
  useEffect(() => {
    const update = (): void => setIsHidden(navHidden);
    update();
    navListeners.add(update);
    return () => {
      navListeners.delete(update);
    };
  }, []);
  return isHidden;
}

function setSlotEl(el: HTMLDivElement | null): void {
  slotEl = el;
  slotListeners.forEach((fn) => fn());
}

/** Ref callback para el <div> del slot dentro del header. */
export function useHeaderSlotRef(): (el: HTMLDivElement | null) => void {
  return useCallback((el: HTMLDivElement | null) => setSlotEl(el), []);
}

/** El nodo del slot, para portar la barra de herramientas del módulo ahí. */
export function useHeaderSlotEl(): HTMLDivElement | null {
  const [el, setEl] = useState(slotEl);
  useEffect(() => {
    const update = (): void => setEl(slotEl);
    update();
    slotListeners.add(update);
    return () => {
      slotListeners.delete(update);
    };
  }, []);
  return el;
}
