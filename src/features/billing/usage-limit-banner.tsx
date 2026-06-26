"use client";

import { useState } from "react";
import { cn } from "@/components/ui";

/**
 * Banner dismisseable (H.2) que avisa cuando el tenant está cerca de algún
 * límite de su plan (generaciones/históricos/miembros). El dismiss es solo
 * estado local: vuelve a aparecer en la siguiente navegación/recarga mientras
 * el límite siga por encima del umbral.
 */
export function UsageLimitBanner({
  messages,
}: {
  messages: string[];
}): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || messages.length === 0) return null;

  return (
    <div
      className={cn(
        "border-b border-warning/30 bg-warning/10 px-6 py-2.5 text-sm text-warning",
      )}
      role="alert"
    >
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          {messages.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-xs font-medium text-warning underline-offset-2 hover:underline"
          aria-label="Cerrar aviso"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
