"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { getPrimaryMembership } from "@/lib/auth/session";
import { sendSignupConfirmationEmail } from "@/lib/email/signup-confirmation";
import { safeInternalPath } from "@/lib/auth/next-path";
import { replacePathLocale } from "@/lib/i18n/locales";
import {
  formAcceptedLegal,
  legalAcceptanceMetadata,
} from "@/lib/legal/acceptance";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(["en", "fr", "es"]).default("en"),
});

const signUpSchema = credentialsSchema
  .extend({
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

export type AuthActionState = {
  error?: string;
  success?: string;
  email?: string;
};

async function destForSignedInUser(fallbackPath: string) {
  const membership = await getPrimaryMembership();
  if (!membership) return fallbackPath;
  return replacePathLocale(
    fallbackPath,
    membership.organization.defaultLocale,
  );
}

async function sendSignupConfirmationLink(input: {
  email: string;
  password: string;
  fullName?: string;
  locale: "en" | "fr" | "es";
  next: string;
}): Promise<{ error?: string }> {
  const admin = createServiceClient();
  const origin = await getAppBaseUrl();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        ...legalAcceptanceMetadata(),
      },
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(input.next)}`,
    },
  });

  if (error || !data?.properties?.hashed_token) {
    // Confirmed account already exists — do not leak that.
    return {};
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(
    data.user.id,
    { password: input.password },
  );
  if (passwordError) {
    console.error("signup password sync:", passwordError.message);
  }

  const tokenHash = data.properties.hashed_token;
  const verifyType = data.properties.verification_type;
  const confirmUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verifyType)}&next=${encodeURIComponent(input.next)}`;
  const sent = await sendSignupConfirmationEmail({
    locale: input.locale,
    to: input.email,
    confirmUrl,
    fullName: input.fullName,
  });

  if (!sent.sent) {
    console.error("signup confirmation email:", sent.reason);
    return { error: "email_send_failed" };
  }

  return {};
}

export async function signInWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    locale: formData.get("locale") || "en",
  });

  if (!parsed.success) {
    return { error: "invalid_credentials" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "sign_in_failed" };
  }

  const next = safeInternalPath(
    formData.get("next"),
    `/${parsed.data.locale}/home`,
  );
  redirect(await destForSignedInUser(next));
}

export async function signUpWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    fullName: formData.get("fullName") || undefined,
    locale: formData.get("locale") || "en",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "password_mismatch") {
      return { error: "password_mismatch" };
    }
    return { error: "invalid_credentials" };
  }

  if (!formAcceptedLegal(formData)) {
    return { error: "legal_required" };
  }

  const next = safeInternalPath(
    formData.get("next"),
    `/${parsed.data.locale}/home`,
  );

  const result = await sendSignupConfirmationLink({
    email: parsed.data.email,
    password: parsed.data.password,
    fullName: parsed.data.fullName,
    locale: parsed.data.locale,
    next,
  });

  if (result.error) {
    return { error: result.error, email: parsed.data.email };
  }

  return { success: "check_email", email: parsed.data.email };
}

export async function signOutAction(formData: FormData) {
  const locale = (formData.get("locale") as string) || "en";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}

export async function signOut(locale: string = "en") {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
