import type { User } from "@supabase/supabase-js";

/** Set for 10 minutes when a consultant checks legal boxes before Google OAuth. */
export const LEGAL_ACCEPT_COOKIE = "yuzu_legal_accept";

export function hasAcceptedLegal(user: User | null | undefined): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  return Boolean(meta.privacy_accepted_at && meta.terms_accepted_at);
}

export function legalAcceptanceMetadata(at = new Date()) {
  const iso = at.toISOString();
  return {
    privacy_accepted_at: iso,
    terms_accepted_at: iso,
  };
}

export function formAcceptedLegal(formData: FormData) {
  return (
    formData.get("privacyAccepted") === "on" &&
    formData.get("termsAccepted") === "on"
  );
}
