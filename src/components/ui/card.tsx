import { cn } from "./cn";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface-elevated p-5 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <h3
      className={cn(
        "flex items-center gap-2 text-base font-semibold text-text-heading",
        className,
      )}
    >
      <span
        className="h-4 w-1 shrink-0 rounded-[var(--radius-full)] bg-gradient-to-b from-brand-aqua to-brand-blue"
        aria-hidden
      />
      {children}
    </h3>
  );
}
