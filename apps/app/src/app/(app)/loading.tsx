/**
 * Loading UI compartido del área autenticada: aparece al instante al navegar
 * mientras el server component de la sección resuelve sus queries.
 */
export default function AppLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded-[var(--radius-md)] bg-border/60" />
        <div className="h-4 w-72 animate-pulse rounded-[var(--radius-md)] bg-border/40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-[var(--radius-lg)] border border-border bg-surface-elevated"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-lg)] border border-border bg-surface-elevated" />
    </div>
  );
}
