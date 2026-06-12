import { cn } from "./cn";

export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
      <table className={cn("w-full text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <thead className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-text-muted">
      {children}
    </thead>
  );
}

export function TH({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <th className={cn("px-4 py-3", className)}>{children}</th>;
}

export function TD({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function TRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <tr
      className={cn(
        "border-b border-border bg-surface-elevated last:border-b-0 hover:bg-surface/60",
        className,
      )}
    >
      {children}
    </tr>
  );
}
