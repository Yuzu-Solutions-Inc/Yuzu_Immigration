import type { User } from "@supabase/supabase-js";

/** True when the user can sign in with email + password (not Google-only). */
export function hasEmailPasswordAuth(user: User): boolean {
  if (user.identities?.some((identity) => identity.provider === "email")) {
    return true;
  }
  const providers = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes("email");
}
