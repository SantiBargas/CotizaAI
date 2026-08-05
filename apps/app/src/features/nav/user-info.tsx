"use client";

import { useUser } from "@clerk/nextjs";
import { cn } from "@cotizaai/ui";
import type { MembershipRole } from "@prisma/client";

const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Admin",
  MEMBER: "Miembro",
};

const ROLE_BADGE_CLASS: Record<MembershipRole, string> = {
  OWNER: "border-[var(--brand-orange)]/40 bg-[var(--brand-orange)]/15 text-[var(--brand-orange)]",
  ADMIN: "border-primary/40 bg-primary/15 text-primary",
  MEMBER: "border-border bg-surface text-text-muted",
};

/** Avatar + nombre + rol en el tenant activo. Puramente informativo (no es
 *  un menú desplegable) — la gestión de cuenta vive en /configuracion. */
export function UserInfo({
  role,
  displayName: savedDisplayName,
}: {
  role: MembershipRole | null;
  /** Nombre guardado en /perfil (independiente de Clerk) — tiene prioridad
   *  porque el email de Clerk es muy largo para el header. */
  displayName: string | null;
}): React.ReactElement {
  const { isLoaded, user } = useUser();
  const displayName = savedDisplayName || user?.fullName || "Usuario";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex min-w-0 items-center gap-2">
      {isLoaded && user?.hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar externo de Clerk
        <img
          src={user.imageUrl}
          alt=""
          className="size-8 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-gradient-to-br from-brand-aqua to-brand-blue text-xs font-bold text-white",
            !isLoaded && "animate-pulse opacity-60",
          )}
        >
          {initial}
        </div>
      )}
      <div className="hidden min-w-0 flex-col items-start gap-0.5 sm:flex">
        <span className="w-full max-w-[8rem] truncate text-xs font-semibold text-text">
          {displayName || " "}
        </span>
        {role && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-full)] border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] shadow-[var(--shadow-sm)]",
              ROLE_BADGE_CLASS[role],
            )}
          >
            {ROLE_LABEL[role]}
          </span>
        )}
      </div>
    </div>
  );
}
