"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { findAuthUserByEmail } from "@/lib/auth/admin-users";
import { finishSignedInRedirect } from "@/lib/auth/finish-login";
import { safeInternalPath } from "@/lib/auth/next-path";
import {
  classifyPasswordUpdateError,
  passwordSchema,
} from "@/lib/auth/password-policy";
import {
  clearPasswordResetRequired,
  isPasswordResetRequired,
} from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { sendSignupConfirmationEmail } from "@/lib/email/signup-confirmation";
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
    password: passwordSchema,
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

const resetRequestSchema = z.object({
  email: z.string().email(),
  locale: z.enum(["en", "fr", "es"]).default("en"),
});

const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(8).max(128),
    locale: z.enum(["en", "fr", "es"]).default("en"),
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

async function sendSignupConfirmationLink(input: {
  email: string;
  password: string;
  fullName?: string;
  locale: "en" | "fr" | "es";
  next: string;
}): Promise<{ error?: string }> {
  const existing = await findAuthUserByEmail(input.email);
  if (existing?.email_confirmed_at) {
    return { error: "account_exists" };
  }

  const admin = createServiceClient();
  if (existing) {
    // generateLink(signup) does not update the password for an existing
    // unconfirmed user. Persist the password they just typed first.
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      existing.id,
      {
        password: input.password,
        user_metadata: {
          full_name: input.fullName,
          ...legalAcceptanceMetadata(),
        },
      },
    );
    if (passwordError) {
      console.error("signup password sync:", passwordError.message);
      return { error: "sign_up_failed" };
    }
  }

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
    console.error("signup generateLink:", error?.message ?? "missing token");
    return { error: "sign_up_failed" };
  }

  const tokenHash = data.properties.hashed_token;
  const confirmUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`;
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

function signInErrorCode(error: { code?: string; message: string }) {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();
  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "email_not_confirmed";
  }
  return "sign_in_failed";
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
    console.error("signInWithPassword:", error.code, error.message);
    return { error: signInErrorCode(error) };
  }

  revalidatePath("/", "layout");
  const next = safeInternalPath(
    formData.get("next"),
    `/${parsed.data.locale}/home`,
  );
  return finishSignedInRedirect(next);
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
    if (issue?.message === "password_weak") {
      return { error: "password_weak" };
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

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale") || "en",
  });

  if (!parsed.success) {
    return { error: "invalid_credentials" };
  }

  const existing = await findAuthUserByEmail(parsed.data.email);
  if (existing?.email_confirmed_at) {
    const admin = createServiceClient();
    const origin = await getAppBaseUrl();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: parsed.data.email,
    });

    if (error || !data?.properties?.hashed_token) {
      console.error("password reset generateLink:", error?.message);
    } else {
      const resetUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
      const sent = await sendPasswordResetEmail({
        locale: parsed.data.locale,
        to: parsed.data.email,
        resetUrl,
      });
      if (!sent.sent) {
        console.error("password reset email:", sent.reason);
        return { error: "email_send_failed", email: parsed.data.email };
      }
    }
  }

  return { success: "check_reset_email", email: parsed.data.email };
}

export async function setNewPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    locale: formData.get("locale") || "en",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "password_mismatch") {
      return { error: "password_mismatch" };
    }
    if (issue?.message === "password_weak") {
      return { error: "password_weak" };
    }
    return { error: "invalid_credentials" };
  }

  if (!(await isPasswordResetRequired())) {
    redirect(`/${parsed.data.locale}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("setNewPassword:", error.message);
    return { error: classifyPasswordUpdateError(error) };
  }

  await clearPasswordResetRequired();
  revalidatePath("/", "layout");
  return finishSignedInRedirect(`/${parsed.data.locale}/home`);
}

export async function signOutAction(formData: FormData) {
  const locale = (formData.get("locale") as string) || "en";
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearPasswordResetRequired();
  redirect(`/${locale}/login`);
}

export async function signOut(locale: string = "en") {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearPasswordResetRequired();
  redirect(`/${locale}/login`);
}
