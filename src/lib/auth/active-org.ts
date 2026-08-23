import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE = "mc_active_org";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function getActiveOrganizationId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_ORG_COOKIE)?.value?.trim();
  return value || null;
}

export async function setActiveOrganizationId(organizationId: string) {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearActiveOrganizationId() {
  const store = await cookies();
  store.delete(ACTIVE_ORG_COOKIE);
}
