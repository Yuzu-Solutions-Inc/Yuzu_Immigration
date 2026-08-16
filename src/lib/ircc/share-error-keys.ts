export const SHARE_ERROR_KEYS = [
  "invalid",
  "mismatch",
  "weak_password",
  "wrong_password",
  "rate_limited",
  "expired",
  "no_email",
  "email_not_configured",
  "send_failed",
  "already_set",
  "auth_required",
  "server_config",
  "privacy_required",
  "legal_required",
] as const;

export type ShareErrorKey = (typeof SHARE_ERROR_KEYS)[number];

export function isShareErrorKey(value: string): value is ShareErrorKey {
  return (SHARE_ERROR_KEYS as readonly string[]).includes(value);
}
