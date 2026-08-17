import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { requireSupabasePublicEnv } from "@/lib/public-env";

/**
 * Service-role client — SERVER ONLY.
 * Bypasses RLS. Use only for trusted admin/jobs paths.
 */
export function createServiceClient() {
  const { url } = requireSupabasePublicEnv();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
