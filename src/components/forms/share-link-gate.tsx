"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  forgotSharePasswordAction,
  loginSharePasswordFormAction,
  setSharePasswordFormAction,
  shareAuthInitialState,
} from "@/app/actions/share-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { ShareAccessState } from "@/lib/ircc/share-auth";

const SHARE_ERROR_KEYS = [
  "invalid",
  "mismatch",
  "weak_password",
  "wrong_password",
  "rate_limited",
  "expired",
  "no_email",
  "email_not_configured",
  "send_failed",
  "already_set",
  "auth_required",
  "server_config",
] as const;

type ShareErrorKey = (typeof SHARE_ERROR_KEYS)[number];

function isShareErrorKey(value: string): value is ShareErrorKey {
  return (SHARE_ERROR_KEYS as readonly string[]).includes(value);
}

export function ShareLinkGate({
  token,
  locale,
  mode,
  organizationName,
  projectTitle,
  expiresAt,
  initialError,
}: {
  token: string;
  locale: string;
  mode: ShareAccessState;
  organizationName: string;
  projectTitle: string;
  expiresAt: string;
  initialError?: string;
}) {
  const t = useTranslations("forms");
  const [forgotState, forgotAction, forgotPending] = useActionState(
    forgotSharePasswordAction,
    shareAuthInitialState,
  );

  const errorKey =
    (initialError && isShareErrorKey(initialError) ? initialError : null) ??
    forgotState.error ??
    null;

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
      }[errorKey] ?? t("errors.generic")
    : null;

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

  const expiresLabel = new Date(expiresAt).toLocaleDateString(
    locale === "fr" ? "fr-CA" : "en-CA",
  );

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
            <form action={setSharePasswordFormAction} className="space-y-4">
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
              <Button type="submit" className="w-full">
                {t("shareAuth.setupCta")}
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
            <form action={loginSharePasswordFormAction} className="space-y-4">
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
              <Button type="submit" className="w-full">
                {t("shareAuth.loginCta")}
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
