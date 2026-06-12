import Link from "next/link";
import { cookies } from "next/headers";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeToggle, ToastProvider } from "@/components/ui";
import { AppNav } from "@/features/nav/app-nav";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-surface">
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
                />
                <UserButton />
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
