"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disablePersonPortalAction,
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
  portalBaseUrl,
  access,
}: {
  locale: string;
  personId: string;
  hasEmail: boolean;
  portalBaseUrl: string;
  access: {
    isActive: boolean;
    lastAuthenticatedAt: string | null;
  } | null;
}) {
  const t = useTranslations("people.portal");
  const [inviteState, inviteAction, invitePending] = useActionState(
    resendPersonPortalInviteAction,
    portalStaffInitialState,
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disablePersonPortalAction,
    portalStaffInitialState,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetPersonPortalAction,
    portalStaffInitialState,
  );
  const [copied, setCopied] = useState(false);

  const active =
    disableState.message !== "disabled" && Boolean(access?.isActive);

  async function copyLink() {
    const ok = await writeClipboard(portalBaseUrl);
    if (!ok) {
      toast.error(t("copyFailed"));
      return;
    }
    setCopied(true);
    toast.success(t("copiedUrl"));
    window.setTimeout(() => setCopied(false), 2000);
  }

  const error =
    inviteState.error || disableState.error || resetState.error;
  const errorMessage = error
    ? {
        invalid: t("errors.invalid"),
        unauthorized: t("errors.unauthorized"),
        forbidden: t("errors.forbidden"),
        not_found: t("errors.not_found"),
        no_email: t("errors.no_email"),
        email_not_configured: t("errors.email_not_configured"),
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

      <div className="group relative rounded-xl border border-border bg-canvas px-3 py-2.5 pr-11">
        <p className="truncate font-mono text-sm text-brand" title={portalBaseUrl}>
          {portalBaseUrl}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void copyLink()}
          aria-label={copied ? t("copiedUrl") : t("copyUrl")}
          title={t("copyUrl")}
          className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-brand"
        >
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>

      {active ? (
        access?.lastAuthenticatedAt ? (
          <FieldHint>
            {t("lastSeen", {
              date: new Date(access.lastAuthenticatedAt).toLocaleString(),
            })}
          </FieldHint>
        ) : (
          <FieldHint>{t("neverSignedIn")}</FieldHint>
        )
      ) : null}

      {!hasEmail ? <FieldHint>{t("noEmailHint")}</FieldHint> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void copyLink()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {t("copyUrl")}
        </Button>
        <form action={inviteAction}>
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="locale" value={locale} />
          <Button
            type="submit"
            variant="outline"
            disabled={invitePending || !hasEmail}
          >
            {invitePending ? <Loader2 className="size-4 animate-spin" /> : null}
            {invitePending ? t("sending") : t("send")}
          </Button>
        </form>
        {active ? (
          <>
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
        ) : null}
      </div>

      {inviteState.message === "invited" ? (
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
