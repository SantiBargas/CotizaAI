import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-brand-aqua to-brand-blue text-primary-fg hover:opacity-90 shadow-[var(--shadow-sm)]",
  secondary:
    "border border-border bg-surface-elevated text-text hover:bg-surface",
  ghost: "text-text hover:bg-surface",
  danger: "bg-error text-white hover:opacity-90",
  accent:
    "bg-brand-orange text-white hover:opacity-90 shadow-[var(--shadow-sm)]",
};

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps): React.ReactElement {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        buttonClassName(variant, size),
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
