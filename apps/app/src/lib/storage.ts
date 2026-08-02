import { getEnv } from "@/lib/env";

/**
 * Object storage para los PDFs históricos (Supabase Storage vía REST, sin SDK).
 * Cada archivo se guarda bajo `tenants/{tenantId}/...` para aislar por tenant.
 *
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only). El bucket
 * (`STORAGE_BUCKET`, default "historicos") debe existir y ser PRIVADO; las
 * descargas se sirven con URLs firmadas de corta duración.
 */

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Storage no configurado: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.",
    );
    this.name = "StorageNotConfiguredError";
  }
}

interface StorageConfig {
  baseUrl: string;
  serviceKey: string;
  bucket: string;
}

function getConfig(): StorageConfig {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new StorageNotConfiguredError();
  }
  return {
    baseUrl: env.SUPABASE_URL.replace(/\/$/, ""),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: env.STORAGE_BUCKET,
  };
}

function objectPath(tenantId: string, fileName: string): string {
  // Nombre saneado + timestamp para evitar colisiones.
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `tenants/${tenantId}/${Date.now()}-${safe}`;
}

/** Sube un archivo y devuelve el path interno (NO una URL pública). */
export async function uploadTenantFile(
  tenantId: string,
  fileName: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const { baseUrl, serviceKey, bucket } = getConfig();
  const path = objectPath(tenantId, fileName);
  const res = await fetch(
    `${baseUrl}/storage/v1/object/${bucket}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: data,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Error subiendo archivo (${res.status}): ${body}`);
  }
  return path;
}

/** URL firmada de descarga (expira; default 10 minutos). */
export async function getSignedUrl(
  path: string,
  expiresInSeconds: number = 600,
): Promise<string> {
  const { baseUrl, serviceKey, bucket } = getConfig();
  const res = await fetch(
    `${baseUrl}/storage/v1/object/sign/${bucket}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Error firmando URL (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { signedURL: string };
  return `${baseUrl}/storage/v1${json.signedURL}`;
}

/** Borra un archivo del bucket (al eliminar el histórico). */
export async function deleteTenantFile(path: string): Promise<void> {
  const { baseUrl, serviceKey, bucket } = getConfig();
  const res = await fetch(
    `${baseUrl}/storage/v1/object/${bucket}/${path}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${serviceKey}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Error borrando archivo (${res.status}): ${body}`);
  }
}

/** True si el storage está configurado (para degradar la UI con gracia). */
export function isStorageConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
