"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Botón "Instalar App" (PWA): solo se dibuja si el navegador soporta la
 *  instalación y todavía no está instalada. Dispara el prompt nativo del
 *  navegador al hacer click. */
export function InstallAppButton(): React.ReactElement | null {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      queueMicrotask(() => setInstalled(true));
      return;
    }

    function onBeforeInstallPrompt(e: Event): void {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallable(true);
    }
    function onInstalled(): void {
      setInstallable(false);
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleClick(): Promise<void> {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstallable(false);
    setDeferredPrompt(null);
  }

  if (installed || !installable) return null;

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      title="Instalar App"
      className="flex h-9 items-center gap-1.5 rounded-[var(--radius-full)] border border-primary/40 bg-gradient-to-r from-brand-aqua to-brand-blue px-3 text-[11px] font-bold uppercase tracking-widest text-white shadow-[var(--shadow-sm)] transition-all hover:brightness-110 active:scale-95"
    >
      <Download className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Instalar App</span>
    </button>
  );
}
