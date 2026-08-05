"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { cn } from "@cotizaai/ui";

/** Botón "Salir" propio (no el menú de Clerk): cierra sesión y redirige a
 *  /ingresar (afterSignOutUrl configurado en <ClerkProvider>). */
export function SignOutButton(): React.ReactElement {
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);

  async function handleClick(): Promise<void> {
    setLoading(true);
    try {
      await signOut();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading}
      title="Salir"
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-[var(--radius-full)] border border-error/30 bg-error/10 px-3 text-[11px] font-bold uppercase tracking-widest text-error transition-colors hover:bg-error/20 disabled:opacity-60",
      )}
    >
      <LogOut className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Salir</span>
    </button>
  );
}
