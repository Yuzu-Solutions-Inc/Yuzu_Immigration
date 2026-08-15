"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  forgotSharePasswordAction,
  loginSharePasswordAction,
  setSharePasswordAction,
  shareAuthInitialState,
  type ShareAuthActionState,
} from "@/app/actions/share-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShareAccessState } from "@/lib/ircc/share-auth";

export function ShareLinkGate({
  token,
  locale,
  mode,
  organizationName,
  projectTitle,
  expiresAt,
}: {
  token: string;
  locale: string;
  mode: ShareAccessState;
  organizationName: string;
  projectTitle: string;
  expiresAt: string;
}) {
  const t = useTranslations("forms");
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

  const activeState: ShareAuthActionState =
    mode === "needs_password_setup" ? setupState : loginState;
  const errorKey = activeState.error ?? forgotState.error;
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
      }[errorKey] ?? t("errors.generic")
    : null;

  useEffect(() => {
    if (forgotState.message === "email_sent") {
      toast.success(t("shareAuth.forgotSuccess"));
    }
  }, [forgotState.message, t]);

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
            <form action={setupAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-2">
                <Label htmlFor="share-password">{t("shareAuth.password")}</Label>
                <Input
                  id="share-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-confirm">{t("shareAuth.confirm")}</Label>
                <Input
                  id="share-confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={setupPending}>
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
                <Input
                  id="share-login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
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
