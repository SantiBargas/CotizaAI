"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.cookie = `theme=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Toggle claro/oscuro. El tema se persiste en cookie para que el root layout
 * lo renderice server-side (sin flash). `initialTheme` viene de esa cookie.
 */
export function ThemeToggle({
  initialTheme,
}: {
  initialTheme: Theme;
}): React.ReactElement {
  // SSR y primer render del cliente comparten `initialTheme` (misma cookie),
  // así que el ícono no genera mismatch de hidratación.
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
      }
      className="inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-elevated text-text-muted transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
