import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { redirectSignedInUser } from "@/lib/auth/finish-login";
import { safeInternalPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function asOtpType(value: string | null): EmailOtpType | null {
  if (!value) return null;
  return OTP_TYPES.includes(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = asOtpType(searchParams.get("type"));
  const next = safeInternalPath(searchParams.get("next"), "/en/home");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return redirectSignedInUser(request, next);
    }
  }

  return NextResponse.redirect(`${origin}/en/login?error=auth_callback`);
}
