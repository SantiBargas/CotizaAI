"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Tras aterrizar en /dashboard (el destino post-login), precarga con datos
 * reales — no solo el esqueleto de loading.tsx — las secciones más usadas,
 * de a una y con un respiro entre cada una. Escalonado a propósito: si las
 * lanzáramos todas juntas competirían por las mismas 5 conexiones del pool
 * de Prisma (ver lib/prisma.ts) con la carga del propio dashboard.
 *
 * `{ kind: "full" }` fuerza a Next a resolver los datos dinámicos durante
 * el prefetch — por default (`"auto"`) una ruta dinámica solo precarga el
 * esqueleto de loading.tsx, no el contenido real. No es una opción pública
 * documentada de `router.prefetch`; si Next cambia esta API en el futuro,
 * el peor caso es que degrada sola al prefetch por default (no rompe).
 */
const SECTIONS_TO_PRELOAD = ["/historicos", "/generar", "/presupuestos"];
const STAGGER_MS = 400;

type PrefetchOptions = NonNullable<
  Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]
>;

export function SectionPrefetch(): null {
  const pathname = usePathname();
  const router = useRouter();
  const doneRef = useRef(false);

  useEffect(() => {
    if (pathname !== "/dashboard" || doneRef.current) return;
    doneRef.current = true;

    const runIdle: (cb: () => void) => void =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : (cb) => setTimeout(cb, 200);

    runIdle(() => {
      SECTIONS_TO_PRELOAD.forEach((href, i) => {
        setTimeout(() => {
          router.prefetch(href, { kind: "full" } as PrefetchOptions);
        }, i * STAGGER_MS);
      });
    });
  }, [pathname, router]);

  return null;
}
