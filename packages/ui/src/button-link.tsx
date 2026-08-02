import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button";

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/** Mismo look que Button, pero renderiza <a> — para CTAs que navegan en vez de disparar una acción. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonLinkProps): React.ReactElement {
  return (
    <a className={cn(buttonClassName(variant, size), className)} {...rest}>
      {children}
    </a>
  );
}
