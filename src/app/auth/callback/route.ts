import { NextResponse } from "next/server";

import { redirectSignedInUser } from "@/lib/auth/finish-login";
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
      return redirectSignedInUser(request, next);
    }
  }

  return NextResponse.redirect(`${origin}/en/login?error=auth_callback`);
}
