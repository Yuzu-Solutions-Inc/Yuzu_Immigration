import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { safeInternalPath } from "@/lib/auth/next-path";
import { getPrimaryMembership } from "@/lib/auth/session";
import { isAppLocale, replacePathLocale } from "@/lib/i18n/locales";
import {
  hasAcceptedLegal,
  LEGAL_ACCEPT_COOKIE,
  legalAcceptanceMetadata,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

function localeFromPath(path: string) {
  const segment = path.split("/")[1];
  return isAppLocale(segment) ? segment : "en";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"), "/en/home");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const jar = await cookies();
      let accepted = hasAcceptedLegal(user);
      if (
        user &&
        !accepted &&
        jar.get(LEGAL_ACCEPT_COOKIE)?.value === "1"
      ) {
        const { error: legalError } = await supabase.auth.updateUser({
          data: legalAcceptanceMetadata(),
        });
        if (!legalError) accepted = true;
      }

      if (user && !accepted) {
        const membership = await getPrimaryMembership();
        if (!membership) {
          const locale = localeFromPath(next);
          const acceptUrl = new URL(`/${locale}/legal/accept`, origin);
          acceptUrl.searchParams.set("next", next);
          const response = NextResponse.redirect(acceptUrl);
          response.cookies.set(LEGAL_ACCEPT_COOKIE, "", {
            path: "/",
            maxAge: 0,
          });
          return response;
        }
      }

      await acceptPendingInvitationsForUser();
      const membership = await getPrimaryMembership();
      const dest = membership
        ? replacePathLocale(next, membership.organization.defaultLocale)
        : next;
      const response = NextResponse.redirect(`${origin}${dest}`);
      response.cookies.set(LEGAL_ACCEPT_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/en/login?error=auth_callback`);
}
