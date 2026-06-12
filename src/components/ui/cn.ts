/** Join condicional de clases (mini clsx, sin dependencia). */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
