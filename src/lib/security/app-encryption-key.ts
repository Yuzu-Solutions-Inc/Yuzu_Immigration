/**
 * Shared AES-256-GCM key for document files and client-field ciphertext.
 * Read at call time so Next env reloads / deploys pick up new keys.
 * Never expose via NEXT_PUBLIC_*.
 */
export function requireAppEncryptionKey(): Buffer {
  const hex = process.env.DOCUMENT_ENCRYPTION_KEY?.trim();
  if (!hex) {
    throw new Error("missing_encryption_key");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("invalid_encryption_key");
  }
  return Buffer.from(hex, "hex");
}

export function hasAppEncryptionKey(): boolean {
  try {
    requireAppEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
