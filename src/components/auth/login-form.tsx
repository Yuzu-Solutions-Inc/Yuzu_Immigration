"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  requestPasswordReset,
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

type AuthMode = "signin" | "signup" | "forgot";

export function LoginForm({
  locale,
  nextPath,
  initialMode = "signin",
  initialError,
}: {
  locale: string;
  nextPath?: string;
  initialMode?: "signin" | "signup";
  initialError?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [prefillEmail, setPrefillEmail] = useState("");
  const [accountExists, setAccountExists] = useState(false);

  const switchMode = useCallback((next: AuthMode) => {
    if (next !== "signin") setAccountExists(false);
    setMode(next);
  }, []);

  const handleAccountExists = useCallback((email: string) => {
    setPrefillEmail(email);
    setAccountExists(true);
    setMode("signin");
  }, []);

  return (
    <LoginFormMode
      key={mode}
      locale={locale}
      nextPath={nextPath}
      mode={mode}
      initialError={initialError}
      prefillEmail={prefillEmail}
      accountExists={accountExists}
      onAccountExists={handleAccountExists}
      onModeChange={switchMode}
    />
  );
}

function LoginFormMode({
  locale,
  nextPath,
  mode,
  initialError,
  prefillEmail,
  accountExists,
  onAccountExists,
  onModeChange,
}: {
  locale: string;
  nextPath?: string;
  mode: AuthMode;
  initialError?: string;
  prefillEmail: string;
  accountExists: boolean;
  onAccountExists: (email: string) => void;
  onModeChange: (mode: AuthMode) => void;
}) {
  const t = useTranslations("auth");
  const tl = useTranslations("legal");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const action =
    mode === "signin"
      ? signInWithPassword
      : mode === "signup"
        ? signUpWithPassword
        : requestPasswordReset;
  const [state, formAction, pending] = useActionState(action, initialState);
  const legalReady = privacyAccepted && termsAccepted;

  useEffect(() => {
    if (mode === "signup" && state.error === "account_exists") {
      onAccountExists(state.email ?? "");
    }
  }, [mode, state.error, state.email, onAccountExists]);

  const errorMessage = state.error
    ? {
        invalid_credentials: t("errors.invalid"),
        password_mismatch: t("errors.passwordMismatch"),
        sign_in_failed: t("errors.signIn"),
        email_not_confirmed: t("errors.emailNotConfirmed"),
        sign_up_failed: t("errors.signUp"),
        email_send_failed: t("errors.emailSendFailed"),
        account_exists: t("errors.accountExists"),
        legal_required: tl("legalRequired"),
      }[state.error] ?? t("errors.generic")
    : accountExists
      ? t("errors.accountExists")
      : initialError === "confirm" || initialError === "auth_callback"
        ? t("errors.confirm")
        : null;

  const awaitingVerification =
    (mode === "signup" && state.success === "check_email") ||
    (mode === "forgot" && state.success === "check_reset_email");

  function switchTo(next: AuthMode) {
    onModeChange(next);
  }

  return (
    <>
      <div className="space-y-3 text-center sm:text-left">
        <BrandLogo size="sm" />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {awaitingVerification
            ? t("checkEmailTitle")
            : mode === "forgot"
              ? t("forgotTitle")
              : t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {awaitingVerification
            ? state.success === "check_reset_email"
              ? t("checkResetEmail", { email: state.email ?? "" })
              : t("checkEmail", { email: state.email ?? "" })
            : mode === "forgot"
              ? t("forgotSubtitle")
              : t("subtitle")}
        </p>
      </div>

      <SurfaceCard>
        {awaitingVerification ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground" role="status">
              {state.success === "check_reset_email"
                ? t("checkResetEmailHint")
                : t("checkEmailHint")}
            </p>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => switchTo("signin")}
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

            {mode === "forgot" ? null : (
              <>
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
              </>
            )}

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
                  defaultValue={prefillEmail}
                />
              </Field>

              {mode === "forgot" ? null : (
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
              )}

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
                    : mode === "signup"
                      ? t("createAccount")
                      : t("sendResetLink")}
              </Button>
            </FormStack>

            {mode === "signin" ? (
              <p className="text-center text-sm">
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-4"
                  onClick={() => switchTo("forgot")}
                >
                  {t("forgotPassword")}
                </button>
              </p>
            ) : null}

            {mode === "forgot" ? (
              <p className="text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-4"
                  onClick={() => switchTo("signin")}
                >
                  {t("signIn")}
                </button>
              </p>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                {mode === "signin" ? t("noAccount") : t("hasAccount")}{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-4"
                  onClick={() =>
                    switchTo(mode === "signin" ? "signup" : "signin")
                  }
                >
                  {mode === "signin" ? t("createAccount") : t("signIn")}
                </button>
              </p>
            )}
          </div>
        )}
      </SurfaceCard>
    </>
  );
}
