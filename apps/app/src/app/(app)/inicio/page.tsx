import { auth, currentUser } from "@clerk/nextjs/server";
import { CreateOrganization } from "@clerk/nextjs";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { InicioScreen } from "@/features/inicio/inicio-screen";

export const dynamic = "force-dynamic";

export default async function InicioPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-text-muted">
          Creá tu empresa para empezar a cotizar.
        </p>
        <CreateOrganization
          afterCreateOrganizationUrl="/inicio"
          appearance={{
            variables: { colorPrimary: "#008e97", borderRadius: "10px" },
          }}
        />
      </div>
    );
  }

  const { userId: clerkUserId } = await auth();
  const [user, membership] = await Promise.all([
    currentUser(),
    clerkUserId
      ? prisma.membership.findFirst({
          where: { tenantId: tenant.id, user: { clerkUserId } },
          select: { role: true, user: { select: { displayName: true } } },
        })
      : null,
  ]);

  // Prioridad: nombre guardado en /perfil > nombre/apellido de Clerk > nombre
  // del tenant. Nunca el email — es muy largo para el hero de bienvenida.
  const displayName =
    membership?.user.displayName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    `Equipo ${tenant.name}`;

  return (
    <InicioScreen
      displayName={displayName}
      role={membership?.role ?? null}
      tenantName={tenant.name}
    />
  );
}
