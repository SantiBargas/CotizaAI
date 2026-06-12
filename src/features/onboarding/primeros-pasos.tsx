import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui";

export interface OnboardingStep {
  label: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * Checklist de primeros pasos del tenant, con estado real derivado de la DB.
 * El dashboard la oculta cuando todos los pasos están completos.
 */
export function PrimerosPasos({
  steps,
}: {
  steps: OnboardingStep[];
}): React.ReactElement {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <CardTitle>Primeros pasos</CardTitle>
        <span className="text-sm tabular-nums text-text-muted">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-[var(--radius-full)] bg-surface">
        <div
          className="h-full rounded-[var(--radius-full)] bg-gradient-to-r from-brand-aqua to-brand-blue transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="flex flex-col gap-1">
        {steps.map((step, i) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className={`group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors ${
                step.done ? "opacity-60" : "hover:bg-surface"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
                <Circle className="size-5 shrink-0 text-text-muted" />
              )}
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    step.done ? "text-text-muted line-through" : "text-text"
                  }`}
                >
                  {i + 1}. {step.label}
                </p>
                {!step.done && (
                  <p className="text-xs text-text-muted">{step.description}</p>
                )}
              </div>
              {!step.done && (
                <ArrowRight className="size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
