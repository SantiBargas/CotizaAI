import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-base font-bold tracking-tight">
            <span className="text-brand-blue">Cotiza</span>
            <span className="text-brand-aqua">AI</span>
          </Link>
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
          />
        </div>
        <UserButton />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
