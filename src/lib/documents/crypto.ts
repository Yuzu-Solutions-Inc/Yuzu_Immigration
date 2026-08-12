import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const ALG = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

function requireDocumentKey(): Buffer {
  const hex = env.DOCUMENT_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "Missing DOCUMENT_ENCRYPTION_KEY in .env.local (64 hex characters)",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt plaintext for Storage. Wire format:
 * version(1) || iv(12) || authTag(16) || ciphertext
 */
export function encryptDocument(plaintext: Buffer): Buffer {
  const key = requireDocumentKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([VERSION]),
    iv,
    authTag,
    ciphertext,
  ]);
}

export function decryptDocument(payload: Buffer): Buffer {
  if (payload.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted document payload");
  }
  const version = payload[0];
  if (version !== VERSION) {
    throw new Error(`Unsupported document encryption version: ${version}`);
  }
  const key = requireDocumentKey();
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(
    1 + IV_LENGTH,
    1 + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
