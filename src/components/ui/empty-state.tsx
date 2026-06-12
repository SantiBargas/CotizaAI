import { cn } from "./cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      {icon && <div className="text-text-muted">{icon}</div>}
      <h3 className="text-base font-semibold text-text-heading">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
