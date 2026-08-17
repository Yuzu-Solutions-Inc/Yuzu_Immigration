"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  signInWithPassword,
  signUpWithPassword,
  type AuthActionState,
} from "@/app/actions/auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SurfaceCard } from "@/components/layout/surface-card";
import { LegalConsentFields } from "@/components/legal/legal-consent-fields";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LEGAL_ACCEPT_COOKIE } from "@/lib/legal/acceptance";

const initialState: AuthActionState = {};

function markLegalAcceptedForOAuth() {
  document.cookie = `${LEGAL_ACCEPT_COOKIE}=1; Path=/; Max-Age=600; SameSite=Lax`;
}

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
  const tl = useTranslations("legal");
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
  const [state, formAction, pending] = useActionState(action, initialState);
  const legalReady = privacyAccepted && termsAccepted;

  const errorMessage = state.error
    ? {
        invalid_credentials: t("errors.invalid"),
        password_mismatch: t("errors.passwordMismatch"),
        sign_in_failed: t("errors.signIn"),
        sign_up_failed: t("errors.signUp"),
        legal_required: tl("legalRequired"),
      }[state.error] ?? t("errors.generic")
    : null;

  const awaitingVerification =
    mode === "signup" && state.success === "check_email";

  function switchMode() {
    setPrivacyAccepted(false);
    setTermsAccepted(false);
    setMode(mode === "signin" ? "signup" : "signin");
  }

  return (
    <>
      <div className="space-y-3 text-center sm:text-left">
        <BrandLogo size="sm" />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {awaitingVerification ? t("checkEmailTitle") : t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {awaitingVerification
            ? t("checkEmail", { email: state.email ?? "" })
            : t("subtitle")}
        </p>
      </div>

      <SurfaceCard>
        {awaitingVerification ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground" role="status">
              {t("checkEmailHint")}
            </p>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={switchMode}
            >
              {t("signIn")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {mode === "signup" ? (
              <LegalConsentFields
                privacyChecked={privacyAccepted}
                termsChecked={termsAccepted}
                onPrivacyChange={setPrivacyAccepted}
                onTermsChange={setTermsAccepted}
                disabled={pending}
              />
            ) : null}

            <GoogleSignInButton
              locale={locale}
              nextPath={nextPath}
              disabled={mode === "signup" && !legalReady}
              onBeforeRedirect={
                mode === "signup" && legalReady
                  ? markLegalAcceptedForOAuth
                  : undefined
              }
            />

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>{t("orEmail")}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <FormStack action={formAction} gap="tight">
              <input type="hidden" name="locale" value={locale} />
              {nextPath ? (
                <input type="hidden" name="next" value={nextPath} />
              ) : null}
              {mode === "signup" ? (
                <>
                  <input
                    type="hidden"
                    name="privacyAccepted"
                    value={privacyAccepted ? "on" : ""}
                  />
                  <input
                    type="hidden"
                    name="termsAccepted"
                    value={termsAccepted ? "on" : ""}
                  />
                </>
              ) : null}

              {mode === "signup" ? (
                <Field>
                  <FieldLabel htmlFor="fullName" required>
                    {t("fullName")}
                  </FieldLabel>
                  <Input
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    required
                  />
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
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
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

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={pending || (mode === "signup" && !legalReady)}
              >
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
                onClick={switchMode}
              >
                {mode === "signin" ? t("createAccount") : t("signIn")}
              </button>
            </p>
          </div>
        )}
      </SurfaceCard>
    </>
  );
}
