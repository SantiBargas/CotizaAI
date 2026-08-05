"use client";

import { useEffect } from "react";

/** Registra el service worker (requisito para que el navegador ofrezca
 *  instalar la PWA). Invisible, solo ejecuta código de fondo. */
export function PwaRegister(): null {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("Error registrando PWA:", err));
    }
  }, []);

  return null;
}
