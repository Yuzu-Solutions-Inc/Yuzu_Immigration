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

export function optionalRotateEncryptionKey(): Buffer | null {
  const hex = process.env.DOCUMENT_ENCRYPTION_KEY_ROTATE?.trim();
  if (!hex) return null;
  return parseAppEncryptionKey(hex, "encryption_key_rotate");
}

/**
 * Wrap keys the live app may need while `DOCUMENT_ENCRYPTION_KEY_ROTATE` is set.
 * Current key first, then the incoming rotate key. Org DEKs / client data are
 * not decrypted with these keys — only `organizations.wrapped_dek`.
 */
export function appWrapKeysForUnwrap(): Buffer[] {
  const keys: Buffer[] = [requireAppEncryptionKey()];
  const rotate = optionalRotateEncryptionKey();
  if (rotate && !rotate.equals(keys[0])) {
    keys.push(rotate);
  }
  return keys;
}

/**
 * Key used to wrap newly created org DEKs.
 * While `DOCUMENT_ENCRYPTION_KEY_ROTATE` is set, new wraps land on that key so
 * the rotation window does not keep writing the outgoing wrap key.
 */
export function activeAppWrapKey(): Buffer {
  return optionalRotateEncryptionKey() ?? requireAppEncryptionKey();
}

export function hasAppEncryptionKey(): boolean {
  try {
    requireAppEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
