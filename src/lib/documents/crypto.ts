import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

/**
 * Encrypt plaintext for Storage with the org DEK. Wire format:
 * version(1) || iv(12) || authTag(16) || ciphertext
 */
export function encryptDocument(plaintext: Buffer, orgKey: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, orgKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, authTag, ciphertext]);
}

export function decryptDocument(payload: Buffer, orgKey: Buffer): Buffer {
  if (payload.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted document payload");
  }
  const version = payload[0];
  if (version !== VERSION) {
    throw new Error(`Unsupported document encryption version: ${version}`);
  }
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(
    1 + IV_LENGTH,
    1 + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALG, orgKey, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("decrypt_failed");
  }
}
