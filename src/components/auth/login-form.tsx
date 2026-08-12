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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

export function LoginForm({
  locale,
  nextPath,
}: {
  locale: string;
  nextPath?: string;
}) {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
  const [state, formAction, pending] = useActionState(action, initialState);

  const errorMessage = state.error
    ? {
        invalid_credentials: t("errors.invalid"),
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

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        {mode === "signup" ? (
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("fullName")}</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              className="h-10"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
            className="h-10"
          />
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {state.success === "check_email" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("checkEmail")}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending
            ? t("pleaseWait")
            : mode === "signin"
              ? t("signIn")
              : t("createAccount")}
        </Button>
      </form>

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
