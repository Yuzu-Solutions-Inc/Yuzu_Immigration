import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { product } from "@/lib/brand/product";
import { finishSignedInRedirect } from "@/lib/auth/finish-login";
import { safeInternalPath } from "@/lib/auth/next-path";
import { markPasswordResetRequired } from "@/lib/auth/password-reset";
import { isAuthTokenHash } from "@/lib/auth/token-hash";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = [
  "recovery",
  "signup",
  "email",
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

function readConfirmParams(request: Request, form?: FormData) {
  const { searchParams } = new URL(request.url);
  const tokenHash = String(
    form?.get("token_hash") || searchParams.get("token_hash") || "",
  ).trim();
  return {
    tokenHash,
    requestedType: asOtpType(
      String(form?.get("type") || searchParams.get("type") || ""),
    ),
    next: safeInternalPath(
      form?.get("next") ?? searchParams.get("next"),
      "/en/home",
    ),
  };
}

/**
 * Static interstitial so mail scanners that GET the link do not consume the OTP.
 * Query values are copied into the form in the browser, never interpolated into HTML.
 */
function continueHtml() {
  const name = product.name;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name}</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F9FAFB;color:#111827;font-family:Inter,Helvetica,Arial,sans-serif;">
  <form method="post" style="max-width:28rem;width:100%;margin:24px;padding:28px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;">
    <input type="hidden" name="token_hash" />
    <input type="hidden" name="type" />
    <input type="hidden" name="next" />
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#4A5568;">${name}</p>
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;">Continue</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4A5568;">Open this page in your browser to finish signing in. Mail scanners that open the link first will not use it up.</p>
    <button type="submit" style="display:inline-block;background:#6366F1;color:#fff;border:0;font-weight:600;font-size:15px;padding:12px 18px;border-radius:10px;cursor:pointer;">Continue</button>
  </form>
  <script>
    (function () {
      var q = new URLSearchParams(location.search);
      var f = document.forms[0];
      f.token_hash.value = q.get("token_hash") || "";
      f.type.value = q.get("type") || "";
      f.next.value = q.get("next") || "";
      f.submit();
    })();
  </script>
</body>
</html>`;
}

async function verifyAndRedirect(input: {
  tokenHash: string;
  requestedType: EmailOtpType | null;
  next: string;
}): Promise<never> {
  const supabase = await createClient();
  const types: EmailOtpType[] = input.requestedType
    ? [input.requestedType]
    : ["recovery", "signup", "email", "magiclink"];

  let lastError: string | null = null;
  for (const type of types) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: input.tokenHash,
    });
    if (error) {
      lastError = error.message;
      continue;
    }
    if (type === "recovery") {
      await markPasswordResetRequired();
      await finishSignedInRedirect("/en/reset-password");
    }
    await finishSignedInRedirect(input.next);
  }

  console.error("auth confirm:", lastError);
  redirect("/en/login?error=confirm");
}

export async function GET(request: Request) {
  const { tokenHash } = readConfirmParams(request);
  if (!isAuthTokenHash(tokenHash)) {
    redirect("/en/login?error=confirm");
  }

  return new Response(continueHtml(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const { tokenHash, requestedType, next } = readConfirmParams(request, form);
  if (!isAuthTokenHash(tokenHash)) {
    redirect("/en/login?error=confirm");
  }

  await verifyAndRedirect({
    tokenHash,
    requestedType,
    next,
  });
}
