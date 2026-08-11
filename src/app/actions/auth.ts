"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl } from "@/lib/app-url";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(["en", "fr", "es"]).default("en"),
});

export type AuthActionState = {
  error?: string;
  success?: string;
};

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

  redirect(`/${parsed.data.locale}/home`);
}

export async function signUpWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName") || undefined,
    locale: formData.get("locale") || "en",
  });

  if (!parsed.success) {
    return { error: "invalid_credentials" };
  }

  const supabase = await createClient();
  const origin = await getAppBaseUrl();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/${parsed.data.locale}/home`,
      data: {
        full_name: parsed.data.fullName,
        preferred_locale: parsed.data.locale,
      },
    },
  });

  if (error) {
    return { error: "sign_up_failed" };
  }

  // If email confirmation is disabled, session exists immediately.
  if (data.session) {
    redirect(`/${parsed.data.locale}/home`);
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
