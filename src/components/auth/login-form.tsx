"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  signInWithPassword,
  signUpWithPassword,
  type AuthActionState,
} from "@/app/actions/auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldSuccess,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

export function LoginForm({
  locale,
  nextPath,
  initialMode = "signin",
}: {
  locale: string;
  nextPath?: string;
  initialMode?: "signin" | "signup";
}) {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
  const [state, formAction, pending] = useActionState(action, initialState);

  const errorMessage = state.error
    ? {
        invalid_credentials: t("errors.invalid"),
        password_mismatch: t("errors.passwordMismatch"),
        sign_in_failed: t("errors.signIn"),
        sign_up_failed: t("errors.signUp"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <div className="space-y-6">
      <GoogleSignInButton locale={locale} nextPath={nextPath} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>{t("orEmail")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <FormStack action={formAction} gap="tight">
        <input type="hidden" name="locale" value={locale} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        {mode === "signup" ? (
          <Field>
            <FieldLabel htmlFor="fullName" required>
              {t("fullName")}
            </FieldLabel>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="email" required>
            {t("email")}
          </FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password" required>
            {t("password")}
          </FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </Field>

        {mode === "signup" ? (
          <Field>
            <FieldLabel htmlFor="confirmPassword" required>
              {t("confirmPassword")}
            </FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        ) : null}

        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

        {state.success === "check_email" ? (
          <FieldSuccess className="text-muted-foreground">
            {t("checkEmail")}
          </FieldSuccess>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? t("pleaseWait")
            : mode === "signin"
              ? t("signIn")
              : t("createAccount")}
        </Button>
      </FormStack>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? t("noAccount") : t("hasAccount")}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? t("createAccount") : t("signIn")}
        </button>
      </p>
    </div>
  );
}
