"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  forgotSharePasswordAction,
  loginSharePasswordAction,
  setSharePasswordAction,
} from "@/app/actions/share-auth";
import { shareAuthInitialState } from "@/app/actions/share-auth-state";
import { isShareErrorKey } from "@/lib/ircc/share-error-keys";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Link } from "@/i18n/navigation";
import type { ShareAccessState } from "@/lib/ircc/share-auth";

export function ShareLinkGate({
  token,
  locale,
  mode,
  organizationName,
  projectTitle,
  expiresLabel,
  initialError,
}: {
  token: string;
  locale: string;
  mode: ShareAccessState;
  organizationName: string;
  projectTitle: string;
  expiresLabel: string;
  initialError?: string;
}) {
  const t = useTranslations("forms");
  const tl = useTranslations("legal");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [setupState, setupAction, setupPending] = useActionState(
    setSharePasswordAction,
    shareAuthInitialState,
  );
  const [loginState, loginAction, loginPending] = useActionState(
    loginSharePasswordAction,
    shareAuthInitialState,
  );
  const [forgotState, forgotAction, forgotPending] = useActionState(
    forgotSharePasswordAction,
    shareAuthInitialState,
  );

  const activeState =
    mode === "needs_password_setup" ? setupState : loginState;
  const errorKey =
    activeState.error ??
    forgotState.error ??
    (initialError && isShareErrorKey(initialError) ? initialError : null);

  const errorMessage = errorKey
    ? {
        invalid: t("shareAuth.errors.invalid"),
        mismatch: t("shareAuth.errors.mismatch"),
        weak_password: t("shareAuth.errors.weakPassword"),
        wrong_password: t("shareAuth.errors.wrongPassword"),
        rate_limited: t("shareAuth.errors.rateLimited"),
        expired: t("errors.expired"),
        no_email: t("shareAuth.errors.noEmail"),
        email_not_configured: t("shareAuth.errors.emailNotConfigured"),
        send_failed: t("shareAuth.errors.sendFailed"),
        already_set: t("shareAuth.errors.alreadySet"),
        auth_required: t("shareAuth.errors.authRequired"),
        server_config: t("shareAuth.errors.serverConfig"),
        privacy_required: t("shareAuth.errors.privacyRequired"),
      }[errorKey] ?? t("errors.generic")
    : null;

  useEffect(() => {
    if (
      setupState.message === "authenticated" ||
      loginState.message === "authenticated"
    ) {
      window.location.replace(`/${locale}/fill/${token}`);
    }
  }, [setupState.message, loginState.message, locale, token]);

  if (forgotState.message === "email_sent") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center space-y-3">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("shareAuth.forgotSuccessTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("shareAuth.forgotSuccessBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <header className="space-y-2 text-center">
        {organizationName ? (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {organizationName}
          </p>
        ) : null}
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {projectTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("clientExpires", { date: expiresLabel })}
        </p>
      </header>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-elevated space-y-4">
        {mode === "needs_password_setup" ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("shareAuth.setupTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("shareAuth.setupBody")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("shareAuth.passwordRules")}
              </p>
            </div>
            <div className="space-y-3 rounded-lg border border-border/70 bg-canvas/80 px-3.5 py-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tl("consentSummary")}
              </p>
              <Link
                href="/privacy"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full",
                )}
              >
                {tl("viewPrivacyPolicy")}
              </Link>
            </div>
            <form action={setupAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-2">
                <Label htmlFor="share-password">{t("shareAuth.password")}</Label>
                <PasswordInput
                  id="share-password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  showLabel={t("shareAuth.showPassword")}
                  hideLabel={t("shareAuth.hidePassword")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-confirm">{t("shareAuth.confirm")}</Label>
                <PasswordInput
                  id="share-confirm"
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  showLabel={t("shareAuth.showPassword")}
                  hideLabel={t("shareAuth.hidePassword")}
                />
              </div>
              <label className="flex items-start gap-2 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  name="privacyAccepted"
                  value="on"
                  required
                  checked={privacyAccepted}
                  onChange={(event) =>
                    setPrivacyAccepted(event.target.checked)
                  }
                  className="mt-1 size-4 rounded border-input"
                />
                <span>
                  {t("shareAuth.privacyConsent")}{" "}
                  <Link
                    href="/privacy"
                    className="text-action underline-offset-2 hover:underline"
                  >
                    {t("shareAuth.privacyPolicy")}
                  </Link>
                  .
                </span>
              </label>
              <Button
                type="submit"
                className="w-full"
                disabled={setupPending || !privacyAccepted}
              >
                {setupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {setupPending ? t("shareAuth.settingUp") : t("shareAuth.setupCta")}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("shareAuth.loginTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("shareAuth.loginBody")}
              </p>
            </div>
            <form action={loginAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-2">
                <Label htmlFor="share-login-password">
                  {t("shareAuth.password")}
                </Label>
                <PasswordInput
                  id="share-login-password"
                  name="password"
                  autoComplete="current-password"
                  required
                  showLabel={t("shareAuth.showPassword")}
                  hideLabel={t("shareAuth.hidePassword")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginPending}>
                {loginPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {loginPending ? t("shareAuth.loggingIn") : t("shareAuth.loginCta")}
              </Button>
            </form>
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("shareAuth.forgotBody")}
              </p>
              <form action={forgotAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="locale" value={locale} />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={forgotPending}
                >
                  {forgotPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {forgotPending
                    ? t("shareAuth.forgotSending")
                    : t("shareAuth.forgotCta")}
                </Button>
              </form>
            </div>
          </>
        )}

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
