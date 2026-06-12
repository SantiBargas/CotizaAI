import { cn } from "./cn";

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "accent";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-surface text-text-muted border-border",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  error: "bg-error/10 text-error border-error/30",
  info: "bg-info/10 text-info border-info/30",
  accent: "bg-brand-orange/10 text-brand-orange border-brand-orange/30",
};

export function Badge({
  variant = "neutral",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
