import { cookies } from "next/headers";

import { PASSWORD_RESET_COOKIE } from "@/lib/auth/password-reset-cookie";

export { PASSWORD_RESET_COOKIE };

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function markPasswordResetRequired() {
  const jar = await cookies();
  jar.set(PASSWORD_RESET_COOKIE, "1", cookieOptions(60 * 15));
}

export async function clearPasswordResetRequired() {
  const jar = await cookies();
  jar.set(PASSWORD_RESET_COOKIE, "", cookieOptions(0));
}

export async function isPasswordResetRequired() {
  const jar = await cookies();
  return jar.get(PASSWORD_RESET_COOKIE)?.value === "1";
}
