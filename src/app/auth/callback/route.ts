import { NextResponse } from "next/server";

import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { safeInternalPath } from "@/lib/auth/next-path";
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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/en/login?error=auth_callback`);
}
