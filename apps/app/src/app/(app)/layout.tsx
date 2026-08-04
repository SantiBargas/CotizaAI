import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeToggle, ToastProvider } from "@cotizaai/ui";
import { AppNav } from "@/features/nav/app-nav";
import { SectionPrefetch } from "@/features/nav/section-prefetch";
import { OrgSwitchRevalidate } from "@/features/nav/org-switch-revalidate";
import { UsageLimitBannerAsync } from "@/features/billing/usage-limit-banner-async";
import { getCurrentTenant } from "@/lib/tenant";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  const tenant = await getCurrentTenant();

  return (
    <ToastProvider>
      <SectionPrefetch />
      <OrgSwitchRevalidate />
      <div className="relative flex min-h-screen flex-col bg-surface">
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
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
              <div className="flex items-center gap-6">
                <Link
                  href="/dashboard"
                  className="text-base font-bold tracking-tight"
                >
                  <span className="text-brand-blue">Cotiza</span>
                  <span className="text-brand-aqua">AI</span>
                </Link>
                <AppNav />
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle initialTheme={theme} />
                <OrganizationSwitcher
                  hidePersonal
                  afterCreateOrganizationUrl="/dashboard"
                  afterSelectOrganizationUrl="/dashboard"
                  appearance={{
                    elements: {
                      // El trigger y el nombre de la organización renderizan
                      // texto negro fijo por default — no se ve en modo
                      // oscuro. [&_*] solo no alcanza (Clerk tiene más
                      // especificidad), forzamos con !important.
                      organizationSwitcherTrigger:
                        "!text-text hover:!text-text [&_*]:!text-inherit",
                      organizationPreviewMainIdentifier: "!text-text",
                      organizationPreviewSecondaryIdentifier: "!text-text-muted",
                      organizationSwitcherTriggerIcon: "!text-text-muted",
                    },
                  }}
                />
                <UserButton />
              </div>
            </div>
          </div>
        </header>
        {tenant && (
          <Suspense fallback={null}>
            <UsageLimitBannerAsync tenantId={tenant.id} />
          </Suspense>
        )}
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
