import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

/**
 * Integración con Google Drive (OAuth 2.0, scope readonly) vía REST, sin SDK.
 * El refresh token se guarda por tenant en TenantIntegration; el access token
 * se renueva en cada operación (no se persiste).
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export class DriveNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Drive no está configurado (faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
    );
    this.name = "DriveNotConfiguredError";
  }
}

export class DriveNotConnectedError extends Error {
  constructor() {
    super("Este tenant no tiene Google Drive conectado.");
    this.name = "DriveNotConnectedError";
  }
}

export function isDriveConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new DriveNotConfiguredError();
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = requireCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${SCOPE} email`,
    access_type: "offline", // necesario para recibir refresh_token
    prompt: "consent", // fuerza refresh_token aunque ya haya consentimiento
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

/** Canjea el authorization code por tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; accessToken: string; email: string | null }> {
  const { clientId, clientSecret } = requireCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(
      `Google OAuth falló: ${json.error_description ?? json.error ?? res.status}`,
    );
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    email: emailFromIdToken(json.id_token),
  };
}

/** Extrae el email del JWT id_token (payload base64url, sin verificar firma:
 *  viene directo del endpoint de tokens de Google por TLS). */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string };
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

/** Access token fresco para el tenant (renovado con su refresh token). */
export async function getAccessToken(tenantId: string): Promise<string> {
  const { clientId, clientSecret } = requireCredentials();
  const integration = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "GOOGLE_DRIVE" },
    },
  });
  if (!integration) throw new DriveNotConnectedError();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    // Token revocado desde Google → limpiar la conexión rota.
    if (json.error === "invalid_grant") {
      await prisma.tenantIntegration.deleteMany({
        where: { tenantId, provider: "GOOGLE_DRIVE" },
      });
      throw new DriveNotConnectedError();
    }
    throw new Error(
      `No se pudo renovar el token de Google: ${json.error ?? res.status}`,
    );
  }
  return json.access_token;
}

export interface DriveFile {
  id: string;
  name: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken: string | null;
}

/** Lista PDFs del Drive del tenant (búsqueda opcional por nombre). */
export async function listPdfs(
  accessToken: string,
  options: { query?: string; pageToken?: string } = {},
): Promise<DriveFileList> {
  const q = [
    "mimeType='application/pdf'",
    "trashed=false",
    options.query
      ? `name contains '${options.query.replace(/'/g, "\\'")}'`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const params = new URLSearchParams({
    q,
    orderBy: "modifiedTime desc",
    pageSize: "25",
    fields: "nextPageToken, files(id, name, size, modifiedTime, webViewLink)",
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      size?: string;
      modifiedTime: string;
      webViewLink?: string;
    }>;
    nextPageToken?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Google Drive list falló: ${json.error?.message ?? res.status}`,
    );
  }
  return {
    files: (json.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink ?? null,
    })),
    nextPageToken: json.nextPageToken ?? null,
  };
}

/** Descarga el contenido binario de un archivo del Drive. */
export async function downloadFile(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const res = await fetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Google Drive download falló: ${res.status}`);
  }
  return res.arrayBuffer();
}

/** Revoca el refresh token en Google (best-effort) y borra la conexión. */
export async function disconnectDrive(tenantId: string): Promise<void> {
  const integration = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_provider: { tenantId, provider: "GOOGLE_DRIVE" },
    },
  });
  if (!integration) return;

  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: integration.refreshToken }).toString(),
    });
  } catch (err) {
    console.warn("No se pudo revocar el token de Google:", err);
  }

  await prisma.tenantIntegration.delete({
    where: { id: integration.id },
  });
}
