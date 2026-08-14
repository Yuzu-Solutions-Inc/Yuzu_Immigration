import { NextResponse } from "next/server";

import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { safeInternalPath } from "@/lib/auth/next-path";
import { getPrimaryMembership } from "@/lib/auth/session";
import { replacePathLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"), "/en/home");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await acceptPendingInvitationsForUser();
      const membership = await getPrimaryMembership();
      const dest = membership
        ? replacePathLocale(next, membership.organization.defaultLocale)
        : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/en/login?error=auth_callback`);
}
