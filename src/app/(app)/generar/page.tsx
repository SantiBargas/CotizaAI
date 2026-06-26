import { currentUser } from "@clerk/nextjs/server";
import { getCurrentTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { checkGenerationLimit } from "@/lib/billing/limits";
import { availableProvidersForTenant, PROVIDER_CATALOG } from "@/lib/ai/providers";
import { GenerarChat } from "@/features/generar/generar-chat";

export const dynamic = "force-dynamic";

/** Frases de bienvenida del estado vacío — rota según el uso del mes. */
const FRASES_BIENVENIDA = [
  "¿Qué cotizamos hoy, {nombre}?",
  "Tu próximo presupuesto empieza acá, {nombre}",
  "Manos a la obra, {nombre}",
  "Decime qué necesitás y lo armamos, {nombre}",
  "A ganar ese cliente, {nombre}",
];

export default async function GenerarPage(): Promise<React.ReactElement> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    return (
      <p className="text-sm text-text-muted">
        Creá o seleccioná una organización para generar presupuestos.
      </p>
    );
  }

  const [user, profile, genLimit, allowedProviders] = await Promise.all([
    currentUser(),
    prisma.companyProfile.findUnique({
      where: { tenantId: tenant.id },
      select: { industry: true },
    }),
    checkGenerationLimit(tenant.id),
    availableProvidersForTenant(tenant.id),
  ]);

  const frase =
    FRASES_BIENVENIDA[genLimit.used % FRASES_BIENVENIDA.length];

  const providers = allowedProviders.map((id) => ({
    id,
    label: PROVIDER_CATALOG[id].label,
  }));

  return (
    <GenerarChat
      nombre={user?.firstName ?? ""}
      frase={frase}
      industry={profile?.industry ?? null}
      usage={{ used: genLimit.used, limit: genLimit.limit }}
      providers={providers}
    />
  );
}
