import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { finishSignedInRedirect } from "@/lib/auth/finish-login";
import { safeInternalPath } from "@/lib/auth/next-path";
import { markPasswordResetRequired } from "@/lib/auth/password-reset";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = [
  "email",
  "signup",
  "recovery",
  "magiclink",
  "invite",
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
      ? [requestedType, ...OTP_TYPES.filter((type) => type !== requestedType)]
      : ["email", "signup", "recovery", "magiclink"];

    let lastError: string | null = null;
    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (error) {
        lastError = error.message;
        continue;
      }
      if (type === "recovery") {
        await markPasswordResetRequired();
        await finishSignedInRedirect("/en/reset-password");
      }
      await finishSignedInRedirect(next);
    }
    console.error("auth confirm:", lastError);
  }

  redirect("/en/login?error=confirm");
}
