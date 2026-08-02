import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";
import { getEnv } from "@/lib/env";

/**
 * Cifrado at-rest (AES-256-GCM) para secretos sensibles guardados en DB
 * (ej. `TenantIntegration.refreshToken` de Google Drive). Usa el módulo
 * `crypto` nativo de Node, sin dependencias nuevas.
 *
 * Clave: `INTEGRATION_ENCRYPTION_KEY` en el entorno, 32 bytes en base64.
 * Generarla con:
 *
 *   openssl rand -base64 32
 *
 * Formato del ciphertext: `iv:authTag:ciphertext`, cada segmento en base64,
 * separados por `:`. El IV y el authTag son necesarios para desencriptar
 * (GCM es un modo autenticado: el authTag detecta manipulación del dato).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // recomendado para GCM
const KEY_LENGTH_BYTES = 32; // AES-256

class EncryptionKeyMissingError extends Error {
  constructor() {
    super(
      "Falta configurar INTEGRATION_ENCRYPTION_KEY (32 bytes en base64; " +
        "generarla con `openssl rand -base64 32`). No se puede cifrar/" +
        "descifrar el secreto sin esta variable.",
    );
    this.name = "EncryptionKeyMissingError";
  }
}

function getKey(): Buffer {
  const env = getEnv();
  if (!env.INTEGRATION_ENCRYPTION_KEY) {
    throw new EncryptionKeyMissingError();
  }
  const key = Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY debe decodificar a ${KEY_LENGTH_BYTES} bytes ` +
        `en base64 (se obtuvieron ${key.length}). Generarla con: openssl rand -base64 32`,
    );
  }
  return key;
}

/** Indica si hay una clave de cifrado configurada en el entorno. */
export function isEncryptionConfigured(): boolean {
  return Boolean(getEnv().INTEGRATION_ENCRYPTION_KEY);
}

/** Cifra un texto plano. Devuelve `iv:authTag:ciphertext` en base64. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Descifra un valor producido por `encrypt`. */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Formato de ciphertext inválido (se esperaba `iv:authTag:ciphertext`).",
    );
  }
  const [ivB64, authTagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
