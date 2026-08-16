import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";

const ALG = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Detectable prefix so legacy plaintext can still be read. */
export const FIELD_ENC_PREFIX = "mc1.";

const JSON_ENC_KEY = "__mc_enc";

export type EncryptedJsonEnvelope = {
  [JSON_ENC_KEY]: string;
};

export function isEncryptedField(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(FIELD_ENC_PREFIX);
}

export function isEncryptedJson(value: unknown): value is EncryptedJsonEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const blob = (value as EncryptedJsonEnvelope)[JSON_ENC_KEY];
  return isEncryptedField(blob);
}

/**
 * Encrypt a UTF-8 string. AAD binds ciphertext to a table.column so blobs
 * cannot be copied between fields. Pass the org DEK for org data; omit `key`
 * only for app-level wrap (DOCUMENT_ENCRYPTION_KEY).
 */
export function encryptField(
  plaintext: string,
  aad: string,
  key?: Buffer,
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key ?? requireAppEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${FIELD_ENC_PREFIX}${payload.toString("base64url")}`;
}

export function decryptField(
  value: string,
  aad: string,
  key?: Buffer,
): string {
  if (!isEncryptedField(value)) return value;

  const raw = Buffer.from(value.slice(FIELD_ENC_PREFIX.length), "base64url");
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("invalid_field_ciphertext");
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(
    ALG,
    key ?? requireAppEncryptionKey(),
    iv,
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Decrypt when prefixed; otherwise return the legacy plaintext (or null).
 * Uses the org DEK only — do not pass the platform wrap key here.
 */
export function decryptFieldMaybe(
  value: string | null | undefined,
  aad: string,
  key: Buffer,
): string | null | undefined {
  if (value == null) return value;
  if (value === "") return value;
  try {
    return decryptField(value, aad, key);
  } catch {
    console.error("decryptField failed:", aad);
    return "[unavailable]";
  }
}

export function encryptOptionalField(
  value: string | null | undefined,
  aad: string,
  key: Buffer,
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return encryptField(trimmed, aad, key);
}

export function encryptJson(
  value: unknown,
  aad: string,
  key: Buffer,
): EncryptedJsonEnvelope {
  return {
    [JSON_ENC_KEY]: encryptField(JSON.stringify(value ?? {}), aad, key),
  };
}

export function decryptJson(
  value: unknown,
  aad: string,
  key: Buffer,
): unknown {
  if (value == null) return {};
  if (!isEncryptedJson(value)) return value;
  const json = decryptFieldMaybe(value[JSON_ENC_KEY], aad, key);
  if (json == null || json === "" || json === "[unavailable]") return {};
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    console.error("decryptJson failed:", aad, error);
    return {};
  }
}
