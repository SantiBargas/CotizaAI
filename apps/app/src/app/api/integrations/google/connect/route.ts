import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { requireTenantContext, apiError } from "@/lib/api";
import {
  buildAuthUrl,
  isDriveConfigured,
} from "@/lib/integrations/google-drive";

/**
 * GET /api/integrations/google/connect — inicia el OAuth de Google Drive.
 * El `state` anti-CSRF viaja en cookie httpOnly y se valida en el callback.
 * El tenant NO viaja en el state: se re-deriva de la sesión Clerk al volver.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireTenantContext(); // exige sesión + org activa antes de salir a Google

    if (!isDriveConfigured()) {
      return NextResponse.json(
        { error: "Google Drive no está configurado en el servidor." },
        { status: 503 },
      );
    }

    const state = crypto.randomBytes(16).toString("hex");
    const redirectUri = `${req.nextUrl.origin}/api/integrations/google/callback`;

    const res = NextResponse.redirect(buildAuthUrl(redirectUri, state));
    res.cookies.set("gdrive_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      maxAge: 600,
      path: "/",
    });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
