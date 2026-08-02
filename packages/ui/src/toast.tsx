"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "./cn";

type ToastKind = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

const kindStyles: Record<ToastKind, string> = {
  success: "border-success/40 text-success",
  error: "border-error/40 text-error",
  warning: "border-warning/40 text-warning",
  info: "border-info/40 text-info",
};

const kindIcons: Record<ToastKind, React.ReactElement> = {
  success: <CheckCircle2 className="size-5" />,
  error: <XCircle className="size-5" />,
  warning: <AlertTriangle className="size-5" />,
  info: <Info className="size-5" />,
};

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((kind: ToastKind, message: string): void => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-[var(--radius-md)] border bg-surface-elevated p-3 shadow-[var(--shadow-md)]",
              kindStyles[t.kind],
            )}
            role="alert"
          >
            {kindIcons[t.kind]}
            <p className="flex-1 text-sm text-text">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
