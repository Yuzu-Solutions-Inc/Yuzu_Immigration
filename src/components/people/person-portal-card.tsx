"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disablePersonPortalAction,
  enablePersonPortalAction,
  resendPersonPortalInviteAction,
  resetPersonPortalAction,
} from "@/app/actions/portal-staff";
import { portalStaffInitialState } from "@/app/actions/portal-state";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/field";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PersonPortalCard({
  locale,
  personId,
  hasEmail,
  access,
}: {
  locale: string;
  personId: string;
  hasEmail: boolean;
  access: {
    accessCode: string;
    portalUrl: string;
    isActive: boolean;
    lastAuthenticatedAt: string | null;
  } | null;
}) {
  const t = useTranslations("people.portal");
  const [enableState, enableAction, enablePending] = useActionState(
    enablePersonPortalAction,
    portalStaffInitialState,
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disablePersonPortalAction,
    portalStaffInitialState,
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendPersonPortalInviteAction,
    portalStaffInitialState,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetPersonPortalAction,
    portalStaffInitialState,
  );
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const copiedRef = useRef<string | null>(null);

  const generatedUrl =
    enableState.portalUrl ?? resendState.portalUrl ?? resetState.portalUrl ?? null;
  const portalUrl = generatedUrl ?? access?.portalUrl ?? null;
  const accessCode =
    enableState.accessCode ??
    resetState.accessCode ??
    resendState.accessCode ??
    access?.accessCode ??
    null;
  const active =
    disableState.message !== "disabled" &&
    (Boolean(access?.isActive) ||
      enableState.message === "enabled" ||
      enableState.message === "invited");

  useEffect(() => {
    if (!generatedUrl || copiedRef.current === generatedUrl) return;
    copiedRef.current = generatedUrl;
    void writeClipboard(generatedUrl).then((ok) => {
      if (!ok) return;
      setCopied("url");
      toast.success(t("copiedUrl"));
      window.setTimeout(() => setCopied(null), 2000);
    });
  }, [generatedUrl, t]);

  async function copy(value: string, kind: "url" | "code") {
    const ok = await writeClipboard(value);
    if (!ok) {
      toast.error(t("copyFailed"));
      return;
    }
    setCopied(kind);
    toast.success(kind === "url" ? t("copiedUrl") : t("copiedCode"));
    window.setTimeout(() => setCopied(null), 2000);
  }

  const error =
    enableState.error ||
    disableState.error ||
    resendState.error ||
    resetState.error;
  const errorMessage = error
    ? {
        invalid: t("errors.invalid"),
        unauthorized: t("errors.unauthorized"),
        forbidden: t("errors.forbidden"),
        not_found: t("errors.not_found"),
        no_email: t("errors.no_email"),
        email_not_configured: t("errors.email_not_configured"),
        enable_failed: t("errors.enable_failed"),
        disable_failed: t("errors.disable_failed"),
        reset_failed: t("errors.reset_failed"),
      }[error] ?? t("errors.generic")
    : null;

  return (
    <SurfaceCard className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("help")}</p>
      </div>

      {active && accessCode ? (
        <div className="space-y-2 rounded-lg border border-border bg-canvas px-3 py-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("accessCode")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-semibold text-brand">
              {accessCode}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(accessCode, "code")}
            >
              {copied === "code" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {t("copyCode")}
            </Button>
            {portalUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copy(portalUrl, "url")}
              >
                {copied === "url" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {t("copyUrl")}
              </Button>
            ) : null}
          </div>
          {access?.lastAuthenticatedAt ? (
            <FieldHint>
              {t("lastSeen", {
                date: new Date(access.lastAuthenticatedAt).toLocaleString(),
              })}
            </FieldHint>
          ) : (
            <FieldHint>{t("neverSignedIn")}</FieldHint>
          )}
        </div>
      ) : null}

      {!hasEmail ? <FieldHint>{t("noEmailHint")}</FieldHint> : null}

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <form action={enableAction}>
            <input type="hidden" name="personId" value={personId} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" disabled={enablePending}>
              {enablePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {enablePending ? t("enabling") : t("enable")}
            </Button>
          </form>
        ) : (
          <>
            <form action={resendAction}>
              <input type="hidden" name="personId" value={personId} />
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="outline"
                disabled={resendPending || !hasEmail}
              >
                {resendPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {resendPending ? t("sending") : t("resend")}
              </Button>
            </form>
            <form action={resetAction}>
              <input type="hidden" name="personId" value={personId} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline" disabled={resetPending}>
                {resetPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {resetPending ? t("resetting") : t("reset")}
              </Button>
            </form>
            <form action={disableAction}>
              <input type="hidden" name="personId" value={personId} />
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="destructive"
                disabled={disablePending}
              >
                {disablePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {disablePending ? t("disabling") : t("disable")}
              </Button>
            </form>
          </>
        )}
      </div>

      {enableState.message === "enabled" || enableState.message === "invited" ? (
        <p className="text-sm font-medium text-success" role="status">
          {enableState.message === "invited" ? t("invited") : t("enabled")}
        </p>
      ) : null}
      {resendState.message === "invited" ? (
        <p className="text-sm font-medium text-success" role="status">
          {t("invited")}
        </p>
      ) : null}
      {resetState.message === "reset" || resetState.message === "reset_invited" ? (
        <p className="text-sm font-medium text-success" role="status">
          {t("resetDone")}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </SurfaceCard>
  );
}
