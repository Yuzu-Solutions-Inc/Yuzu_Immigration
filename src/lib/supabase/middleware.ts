import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { safeInternalPath } from "@/lib/auth/next-path";
import { PASSWORD_RESET_COOKIE } from "@/lib/auth/password-reset-cookie";
import { isAppLocale, type AppLocale } from "@/lib/i18n/locales";

function getLocaleFromPath(pathname: string): AppLocale {
  const segment = pathname.split("/")[1];
  if (isAppLocale(segment)) {
    return segment;
  }
  return routing.defaultLocale;
}

function stripLocale(pathname: string) {
  const locale = getLocaleFromPath(pathname);
  const without = pathname.replace(new RegExp(`^/${locale}`), "") || "/";
  return { locale, pathname: without };
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const { locale, pathname } = stripLocale(request.nextUrl.pathname);

  const isAuthRoute = pathname === "/login";
  const isPasswordResetRoute = pathname === "/reset-password";
  const isProtectedRoute =
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/legal/accept" ||
    pathname.startsWith("/legal/accept/") ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname === "/people" ||
    pathname.startsWith("/people/") ||
    pathname === "/calendar" ||
    pathname.startsWith("/calendar/") ||
    pathname === "/bookings" ||
    pathname.startsWith("/bookings/") ||
    pathname === "/services" ||
    pathname.startsWith("/services/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    isPasswordResetRoute;

  if (!isProtectedRoute && !isAuthRoute && !isPasswordResetRoute) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/login`;
    redirectUrl.searchParams.set("next", `/${locale}${pathname}`);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  const mustResetPassword =
    Boolean(user) &&
    request.cookies.get(PASSWORD_RESET_COOKIE)?.value === "1";

  if (mustResetPassword && !isPasswordResetRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/reset-password`;
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  if (user && isAuthRoute) {
    const requestedNext = safeInternalPath(
      request.nextUrl.searchParams.get("next"),
      `/${locale}/home`,
    );
    const nextPath = stripLocale(requestedNext).pathname;
    const next =
      nextPath === "/login" || nextPath.startsWith("/login/")
        ? `/${locale}/home`
        : requestedNext;
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = next;
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
