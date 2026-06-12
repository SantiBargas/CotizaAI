import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/api";
import { exchangeCode } from "@/lib/integrations/google-drive";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/integrations/google/callback — vuelta del OAuth de Google.
 * Valida el state (cookie), canjea el code y guarda el refresh token del
 * tenant activo en la sesión. Redirige a /historicos con el resultado.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const redirectTo = (result: string): NextResponse => {
    const res = NextResponse.redirect(
      `${req.nextUrl.origin}/historicos?drive=${result}`,
    );
    res.cookies.delete("gdrive_oauth_state");
    return res;
  };

  try {
    const { tenant, user } = await requireTenantContext();

    const stateParam = req.nextUrl.searchParams.get("state");
    const stateCookie = req.cookies.get("gdrive_oauth_state")?.value;
    if (!stateParam || !stateCookie || stateParam !== stateCookie) {
      return redirectTo("state-error");
    }

    if (req.nextUrl.searchParams.get("error")) {
      // El usuario canceló el consentimiento en Google.
      return redirectTo("denied");
    }

    const code = req.nextUrl.searchParams.get("code");
    if (!code) return redirectTo("error");

    const redirectUri = `${req.nextUrl.origin}/api/integrations/google/callback`;
    const { refreshToken, email } = await exchangeCode(code, redirectUri);

    await prisma.tenantIntegration.upsert({
      where: {
        tenantId_provider: { tenantId: tenant.id, provider: "GOOGLE_DRIVE" },
      },
      create: {
        tenantId: tenant.id,
        provider: "GOOGLE_DRIVE",
        refreshToken,
        accountEmail: email,
      },
      update: { refreshToken, accountEmail: email },
    });

    await logAudit({
      tenantId: tenant.id,
      actorUserId: user?.id,
      action: "INTEGRATION_CONNECTED",
      payload: { provider: "GOOGLE_DRIVE", email },
    });

    return redirectTo("connected");
  } catch (err) {
    console.error("Error en callback de Google Drive:", err);
    return redirectTo("error");
  }
}
