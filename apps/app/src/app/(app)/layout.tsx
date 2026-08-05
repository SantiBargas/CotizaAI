import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { OrganizationSwitcher } from "@clerk/nextjs";
import { Settings } from "lucide-react";
import { ThemeToggle, ToastProvider } from "@cotizaai/ui";
import { AppNav } from "@/features/nav/app-nav";
import { HeaderSlot } from "@/features/nav/header-slot";
import { SectionPrefetch } from "@/features/nav/section-prefetch";
import { OrgSwitchRevalidate } from "@/features/nav/org-switch-revalidate";
import { UserInfo } from "@/features/nav/user-info";
import { AdminDbButton } from "@/features/nav/admin-db-button";
import { InstallAppButton } from "@/features/nav/install-app-button";
import { SignOutButton } from "@/features/nav/sign-out-button";
import { UsageLimitBannerAsync } from "@/features/billing/usage-limit-banner-async";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  const tenant = await getCurrentTenant();
  const { userId: clerkUserId } = await auth();
  const membership =
    tenant && clerkUserId
      ? await prisma.membership.findFirst({
          where: { tenantId: tenant.id, user: { clerkUserId } },
          select: { role: true, user: { select: { displayName: true } } },
        })
      : null;
  const role = membership?.role ?? null;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  return (
    <ToastProvider>
      <SectionPrefetch />
      <OrgSwitchRevalidate />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <div
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-brand-aqua/10 via-brand-blue/5 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none fixed bottom-0 right-0 -z-10 size-[420px] rounded-full bg-brand-orange/5 blur-[120px]"
          aria-hidden
        />
        <header className="sticky top-0 z-10 border-b border-border bg-bg">
          {/* Regla de marca: aqua → azul → naranja (Miami Dolphins) */}
          <div className="h-1 bg-gradient-to-r from-brand-aqua via-brand-blue to-brand-orange" />
          <div className="px-6 py-3">
            {/* 3 columnas full-bleed (sin max-w/mx-auto, igual que ITZA): los
                laterales son "1fr" (siempre iguales entre sí) y el centro es
                "auto" (su propio ancho) — así el nav queda centrado en el
                viewport real y los laterales quedan pegados al borde real de
                la ventana, no al borde de una caja centrada. */}
            <HeaderSlot>
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href="/inicio"
                  className="shrink-0 text-base font-bold tracking-tight"
                >
                  <span className="text-brand-blue">Cotiza</span>
                  <span className="text-brand-aqua">AI</span>
                </Link>
                {isAdmin && <AdminDbButton />}
                <OrganizationSwitcher
                  hidePersonal
                  afterCreateOrganizationUrl="/inicio"
                  afterSelectOrganizationUrl="/inicio"
                  appearance={{
                    elements: {
                      // El trigger y el nombre de la organización renderizan
                      // texto negro fijo por default — no se ve en modo
                      // oscuro. [&_*] solo no alcanza (Clerk tiene más
                      // especificidad), forzamos con !important.
                      organizationSwitcherTrigger:
                        "!text-text hover:!text-text [&_*]:!text-inherit max-w-[8rem]",
                      organizationPreviewMainIdentifier: "!text-text",
                      organizationPreviewSecondaryIdentifier: "!text-text-muted",
                      organizationSwitcherTriggerIcon: "!text-text-muted",
                    },
                  }}
                />
                <UserInfo
                  role={role}
                  displayName={membership?.user.displayName ?? null}
                />
              </div>

              <div className="flex justify-center">
                <AppNav />
              </div>

              <div className="flex items-center justify-end gap-2">
                <ThemeToggle initialTheme={theme} />
                <InstallAppButton />
                <Link
                  href="/configuracion"
                  title="Configuración"
                  aria-label="Configuración"
                  className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border text-text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  <Settings className="size-4" />
                </Link>
                <SignOutButton />
              </div>
            </div>
            </HeaderSlot>
          </div>
        </header>
        {tenant && (
          <Suspense fallback={null}>
            <UsageLimitBannerAsync tenantId={tenant.id} />
          </Suspense>
        )}
        {/* El scroll de página vive en <main> a ancho completo, NO en un div
            con max-w — si el contenedor que scrollea también está centrado
            con max-w-6xl, la scrollbar renderiza pegada al borde de esa
            caja centrada en vez de al borde real del viewport ("scroll
            achicado"). El max-w/padding centrado vive en un div interno que
            hereda el mismo flex-1 min-h-0 (así /generar sigue pudiendo
            acotar su propio alto al espacio disponible en vez de crecer sin
            límite). overflow-x explícito por la misma razón que en
            globals.css: dejarlo implícito lo auto-convierte a "auto" y
            recorta el full-bleed de /generar. */}
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-x-visible overflow-y-auto">
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
