"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  forgotPortalPasswordAction,
  loginPortalAction,
  setPortalPasswordAction,
} from "@/app/actions/portal-auth";
import { portalAuthInitialState } from "@/app/actions/portal-state";
import { LegalConsentFields } from "@/components/legal/legal-consent-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Link } from "@/i18n/navigation";
import type { PortalAccessState } from "@/lib/portal/session";
import { cn } from "@/lib/utils";

export function PortalLoginGate({
  locale,
  mode,
  token,
  organizationName,
  initialError,
}: {
  locale: string;
  mode: Exclude<PortalAccessState, "authenticated">;
  token?: string;
  organizationName?: string;
  initialError?: string;
}) {
  const t = useTranslations("portal");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [view, setView] = useState(mode);
  const [accessCode, setAccessCode] = useState("");
  const [setupState, setupAction, setupPending] = useActionState(
    setPortalPasswordAction,
    portalAuthInitialState,
  );
  const [loginState, loginAction, loginPending] = useActionState(
    loginPortalAction,
    portalAuthInitialState,
  );
  const [forgotState, forgotAction, forgotPending] = useActionState(
    forgotPortalPasswordAction,
    portalAuthInitialState,
  );

  const activeState =
    view === "needs_password_setup" ? setupState : loginState;
  const rawError = activeState.error ?? forgotState.error ?? initialError;
  const errorKey =
    (rawError === "needs_setup" && view === "needs_password_setup") ||
    (rawError === "already_set" && view === "needs_password_login")
      ? null
      : rawError;
  const errorMessage = errorKey
    ? {
        invalid: t("errors.invalid"),
        mismatch: t("errors.mismatch"),
        weak_password: t("errors.weakPassword"),
        wrong_password: t("errors.wrongPassword"),
        rate_limited: t("errors.rateLimited"),
        already_set: t("errors.alreadySet"),
        needs_setup: t("errors.needsSetup"),
        no_email: t("errors.noEmail"),
        email_not_configured: t("errors.emailNotConfigured"),
        send_failed: t("errors.sendFailed"),
        legal_required: t("errors.legalRequired"),
        server_config: t("errors.serverConfig"),
        generic: t("errors.generic"),
      }[errorKey] ?? t("errors.generic")
    : null;

  useEffect(() => {
    setView(mode);
  }, [mode]);

  useEffect(() => {
    if (loginState.error === "needs_setup") {
      setView("needs_password_setup");
    }
  }, [loginState.error]);

  useEffect(() => {
    if (setupState.error === "already_set") {
      setView("needs_password_login");
    }
  }, [setupState.error]);

  useEffect(() => {
    if (
      setupState.message === "authenticated" ||
      loginState.message === "authenticated"
    ) {
      window.location.replace(`/${locale}/portal/home`);
    }
  }, [setupState.message, loginState.message, locale]);

  if (forgotState.message === "email_sent") {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("forgotSuccessTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("forgotSuccessBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <header className="space-y-2 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {organizationName
            ? t("subtitleOrg", { org: organizationName })
            : t("subtitle")}
        </p>
      </header>

      <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-elevated">
        {view === "needs_password_setup" ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("setupTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("setupBody")}</p>
              <p className="text-xs text-muted-foreground">{t("passwordRules")}</p>
            </div>
            <form action={setupAction} className="space-y-4">
              {token ? <input type="hidden" name="token" value={token} /> : null}
              <input type="hidden" name="locale" value={locale} />
              {token ? null : (
                <Field>
                  <FieldLabel htmlFor="portal-access-code" required>
                    {t("accessCode")}
                  </FieldLabel>
                  <Input
                    id="portal-access-code"
                    name="accessCode"
                    autoComplete="username"
                    required
                    className="uppercase"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="portal-password" required>
                  {t("password")}
                </FieldLabel>
                <PasswordInput
                  id="portal-password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-confirm" required>
                  {t("confirm")}
                </FieldLabel>
                <PasswordInput
                  id="portal-confirm"
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                />
              </Field>
              <LegalConsentFields
                privacyChecked={privacyAccepted}
                termsChecked={termsAccepted}
                onPrivacyChange={setPrivacyAccepted}
                onTermsChange={setTermsAccepted}
                disabled={setupPending}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={setupPending || !privacyAccepted || !termsAccepted}
              >
                {setupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {setupPending ? t("settingUp") : t("setupCta")}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("loginTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("loginBody")}</p>
            </div>
            <form action={loginAction} className="space-y-4">
              {token ? <input type="hidden" name="token" value={token} /> : null}
              <input type="hidden" name="locale" value={locale} />
              {token ? null : (
                <Field>
                  <FieldLabel htmlFor="portal-login-code" required>
                    {t("accessCode")}
                  </FieldLabel>
                  <Input
                    id="portal-login-code"
                    name="accessCode"
                    autoComplete="username"
                    required
                    className="uppercase"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                  />
                  <FieldHint>{t("accessCodeHint")}</FieldHint>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="portal-login-password" required>
                  {t("password")}
                </FieldLabel>
                <PasswordInput
                  id="portal-login-password"
                  name="password"
                  autoComplete="current-password"
                  required
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={loginPending}>
                {loginPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {loginPending ? t("loggingIn") : t("loginCta")}
              </Button>
            </form>
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">{t("forgotBody")}</p>
              <form action={forgotAction} className="space-y-3">
                {token ? <input type="hidden" name="token" value={token} /> : null}
                <input type="hidden" name="locale" value={locale} />
                {token ? null : (
                  <Field>
                    <FieldLabel htmlFor="portal-forgot-code" required>
                      {t("accessCode")}
                    </FieldLabel>
                  <Input
                    id="portal-forgot-code"
                    name="accessCode"
                    autoComplete="username"
                    required
                    className="uppercase"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                  />
                  </Field>
                )}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={forgotPending}
                >
                  {forgotPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {forgotPending ? t("forgotSending") : t("forgotCta")}
                </Button>
              </form>
            </div>
          </>
        )}

        {!token ? (
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "h-auto p-0 text-action",
            )}
            onClick={() =>
              setView(
                view === "needs_password_setup"
                  ? "needs_password_login"
                  : "needs_password_setup",
              )
            }
          >
            {view === "needs_password_setup"
              ? t("signInInstead")
              : t("firstVisitCta")}
          </button>
        ) : null}

        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link
          href="/privacy"
          className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}
        >
          {t("privacy")}
        </Link>
      </p>
    </div>
  );
}
