import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Keep auth callback outside locale routing.
  if (request.nextUrl.pathname.startsWith("/auth")) {
    return updateSession(request);
  }

  // If Supabase falls back to Site URL (marketing `/` or `/en`) after Google,
  // the PKCE `code` lands on the landing page and is never exchanged.
  if (request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  const sessionResponse = await updateSession(request);

  // Auth redirects already decided the response.
  if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
    return sessionResponse;
  }

  const intlResponse = intlMiddleware(request);

  sessionResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value);
  });

  return intlResponse;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*|api).*)"],
};
