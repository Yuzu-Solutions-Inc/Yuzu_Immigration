import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { finishSignedInRedirect } from "@/lib/auth/finish-login";
import { safeInternalPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = [
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

function asOtpType(value: string | null): EmailOtpType | null {
  if (!value) return null;
  return OTP_TYPES.includes(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const requestedType = asOtpType(searchParams.get("type"));
  const next = safeInternalPath(searchParams.get("next"), "/en/home");

  if (tokenHash) {
    const supabase = await createClient();
    const types: EmailOtpType[] = requestedType
      ? [requestedType, requestedType === "email" ? "signup" : "email"]
      : ["email", "signup"];

    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) {
        await finishSignedInRedirect(next);
      } else {
        console.error("auth confirm:", type, error.message);
      }
    }
  }

  redirect("/en/login?error=confirm");
}
