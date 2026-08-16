"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl } from "@/lib/app-url";
import { getPrimaryMembership } from "@/lib/auth/session";
import { safeInternalPath } from "@/lib/auth/next-path";
import { replacePathLocale } from "@/lib/i18n/locales";

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
};

async function destForSignedInUser(fallbackPath: string) {
  const membership = await getPrimaryMembership();
  if (!membership) return fallbackPath;
  return replacePathLocale(
    fallbackPath,
    membership.organization.defaultLocale,
  );
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

  const supabase = await createClient();
  const origin = await getAppBaseUrl();
  const next = safeInternalPath(
    formData.get("next"),
    `/${parsed.data.locale}/home`,
  );

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        full_name: parsed.data.fullName,
      },
    },
  });

  if (error) {
    return { error: "sign_up_failed" };
  }

  // If email confirmation is disabled, session exists immediately.
  if (data.session) {
    redirect(await destForSignedInUser(next));
  }

  return { success: "check_email" };
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
