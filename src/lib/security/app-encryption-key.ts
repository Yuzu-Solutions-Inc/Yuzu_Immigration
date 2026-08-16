/**
 * Platform wrap key for per-org data-encryption keys.
 * Read at call time so env reloads / deploys pick up new keys.
 * Never expose via NEXT_PUBLIC_*.
 *
 * Org data (PII, documents, secrets) is encrypted with the org DEK.
 * This key only wraps `organizations.wrapped_dek` (and ephemeral OAuth state).
 */

export function parseAppEncryptionKey(
  hex: string | undefined,
  label = "encryption_key",
): Buffer {
  const trimmed = hex?.trim();
  if (!trimmed) {
    throw new Error(`missing_${label}`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(`invalid_${label}`);
  }
  return Buffer.from(trimmed, "hex");
}

export function requireAppEncryptionKey(): Buffer {
  return parseAppEncryptionKey(
    process.env.DOCUMENT_ENCRYPTION_KEY,
    "encryption_key",
  );
}

export function requireRotateEncryptionKey(): Buffer {
  return parseAppEncryptionKey(
    process.env.DOCUMENT_ENCRYPTION_KEY_ROTATE,
    "encryption_key_rotate",
  );
}

export function hasAppEncryptionKey(): boolean {
  try {
    requireAppEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
