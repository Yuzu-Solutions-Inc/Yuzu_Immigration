import "server-only";

import { env } from "@/lib/env";
import { requireSupabasePublicEnv } from "@/lib/public-env";

export type AuthAdminUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
};

/** GoTrue admin lookup by exact email. Service-role only. */
export async function findAuthUserByEmail(
  email: string,
): Promise<AuthAdminUser | null> {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const { url } = requireSupabasePublicEnv();
  const response = await fetch(
    `${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("findAuthUserByEmail:", response.status);
    return null;
  }

  const body = (await response.json()) as { users?: AuthAdminUser[] };
  const users = body.users ?? [];
  const needle = email.toLowerCase();
  return (
    users.find((user) => user.email?.toLowerCase() === needle) ??
    users[0] ??
    null
  );
}
