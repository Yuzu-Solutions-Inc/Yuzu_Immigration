/** Supabase `hashed_token` values are hex or base64url. Reject anything else. */
const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{16,256}$/;

export function isAuthTokenHash(value: string): boolean {
  return TOKEN_HASH_RE.test(value);
}
