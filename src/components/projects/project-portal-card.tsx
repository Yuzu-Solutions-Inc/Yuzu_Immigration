"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { inviteProjectPortalAction } from "@/app/actions/portal-staff";
import { portalProjectInitialState } from "@/app/actions/portal-state";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/field";
import { cn } from "@/lib/utils";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ProjectPortalCard({
  locale,
  projectId,
  portalBaseUrl,
  inviteeNames,
  hasAnyInviteeEmail,
}: {
  locale: string;
  projectId: string;
  portalBaseUrl: string;
  inviteeNames: string[];
  hasAnyInviteeEmail: boolean;
}) {
  const t = useTranslations("projects.portal");
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteProjectPortalAction,
    portalProjectInitialState,
  );
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const ok = await writeClipboard(portalBaseUrl);
    if (!ok) {
      toast.error(t("copyFailed"));
      return;
    }
    setCopied(true);
    toast.success(t("copied"));
    window.setTimeout(() => setCopied(false), 2000);
  }

  const errorKey = inviteState.error;
  const errorMessage = errorKey
    ? {
        invalid: t("errors.invalid"),
        unauthorized: t("errors.unauthorized"),
        forbidden: t("errors.forbidden"),
        not_found: t("errors.not_found"),
        none_to_invite: t("errors.none_to_invite"),
        no_email: t("errors.no_email"),
        email_not_configured: t("errors.email_not_configured"),
        generic: t("errors.generic"),
      }[errorKey] ?? t("errors.generic")
    : null;

  const invitedCount = inviteState.invited ?? 0;
  const skippedCount = inviteState.skippedNoEmail ?? 0;
  const successMessage =
    inviteState.message === "invited"
      ? t("sent", { count: invitedCount })
      : inviteState.message === "invited_partial"
        ? t("sentPartial", { sent: invitedCount, skipped: skippedCount })
        : null;

  return (
    <SurfaceCard className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("title")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("help")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => void copyLink()}>
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            {t("copy")}
          </Button>
          <form action={inviteAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="locale" value={locale} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={invitePending || !hasAnyInviteeEmail}
            >
              {invitePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {invitePending ? t("sending") : t("send")}
            </Button>
          </form>
        </div>
      </div>

      {inviteeNames.length > 0 ? (
        <FieldHint>{t("recipients", { names: inviteeNames.join(", ") })}</FieldHint>
      ) : (
        <FieldHint>{t("noAdults")}</FieldHint>
      )}
      {inviteeNames.length > 0 && !hasAnyInviteeEmail ? (
        <FieldHint>{t("noEmail")}</FieldHint>
      ) : null}

      <div className="group relative rounded-xl border border-border bg-canvas px-3 py-2.5 pr-11">
        <p className="truncate font-mono text-sm text-brand" title={portalBaseUrl}>
          {portalBaseUrl}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void copyLink()}
          aria-label={copied ? t("copied") : t("copy")}
          title={t("copy")}
          className={cn(
            "absolute top-1.5 right-1.5 text-muted-foreground hover:text-brand",
          )}
        >
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>

      {successMessage ? (
        <p className="text-sm font-medium text-success" role="status">
          {successMessage}
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
