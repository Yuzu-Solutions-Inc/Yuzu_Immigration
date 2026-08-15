"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createFormShareLinkAction,
  revealFormShareLinkAction,
  revokeFormShareLinkAction,
  type FormsActionState,
} from "@/app/actions/forms";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: FormsActionState = {};

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ProjectShareLinkCard({
  locale,
  projectId,
  activeShareExpiresAt,
  canReveal,
  modificationBlocked = false,
}: {
  locale: "en" | "fr";
  projectId: string;
  activeShareExpiresAt: string | null;
  canReveal: boolean;
  modificationBlocked?: boolean;
}) {
  const t = useTranslations("forms");
  const tp = useTranslations("projects");
  const [shareState, shareAction, sharePending] = useActionState(
    createFormShareLinkAction,
    initialState,
  );
  const [revealState, revealAction, revealPending] = useActionState(
    revealFormShareLinkAction,
    initialState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeFormShareLinkAction,
    initialState,
  );
  const [copied, setCopied] = useState(false);
  const [linkHidden, setLinkHidden] = useState(false);
  const copiedUrlRef = useRef<string | null>(null);

  const shareUrl = linkHidden
    ? null
    : (shareState.shareUrl ?? revealState.shareUrl ?? null);
  const active =
    !linkHidden && (Boolean(activeShareExpiresAt) || Boolean(shareUrl));
  const dateLocale = locale === "fr" ? "fr-CA" : "en-CA";
  const expiresLabel = activeShareExpiresAt
    ? new Date(activeShareExpiresAt).toLocaleDateString(dateLocale)
    : shareState.expiresAt
      ? new Date(shareState.expiresAt).toLocaleDateString(dateLocale)
      : null;

  useEffect(() => {
    if (shareState.message === "shared" && shareState.shareUrl) {
      setLinkHidden(false);
    }
  }, [shareState]);

  useEffect(() => {
    if (revokeState.message !== "revoked") return;
    setLinkHidden(true);
    setCopied(false);
    copiedUrlRef.current = null;
    toast.success(t("shareRevoked"));
  }, [revokeState, t]);

  useEffect(() => {
    if (!shareUrl || copiedUrlRef.current === shareUrl) return;
    copiedUrlRef.current = shareUrl;
    void writeClipboard(shareUrl).then((ok) => {
      if (!ok) return;
      setCopied(true);
      toast.success(t("shareCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl, t]);

  async function copyLink() {
    if (!shareUrl) return;
    const ok = await writeClipboard(shareUrl);
    if (!ok) {
      toast.error(t("errors.copyFailed"));
      return;
    }
    setCopied(true);
    toast.success(t("shareCopied"));
    window.setTimeout(() => setCopied(false), 2000);
  }

  const shareError =
    shareState.error || revealState.error || revokeState.error
      ? {
          invalid: t("errors.invalid"),
          unauthorized: t("errors.unauthorized"),
          expired: t("errors.expired"),
          unrecoverable: t("errors.shareUnrecoverable"),
          share_failed: t("errors.shareFailed"),
          granted: t("errors.granted"),
        }[
          (shareState.error ||
            revealState.error ||
            revokeState.error) as string
        ] ?? t("errors.shareFailed")
      : null;

  return (
    <SurfaceCard className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("shareTitle")}
          </h3>
          {active && expiresLabel ? (
            <p className="text-xs text-muted-foreground">
              {t("shareActiveShort", { date: expiresLabel })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("shareInactive")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {active && !shareUrl && canReveal ? (
            <form action={revealAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={revealPending}
              >
                {revealPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {revealPending ? t("shareShowing") : t("shareShowLink")}
              </Button>
            </form>
          ) : null}
          <form action={shareAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="locale" value={locale} />
            <Button
              type="submit"
              size="sm"
              disabled={sharePending || modificationBlocked}
            >
              {sharePending
                ? t("sharing")
                : active
                  ? t("newShareLink")
                  : t("createShareLink")}
            </Button>
          </form>
          {active ? (
            <form action={revokeAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={revokePending}
              >
                {revokePending ? t("shareRevoking") : t("revokeShareLink")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {shareUrl ? (
        <div className="group relative rounded-xl border border-border bg-canvas px-3 py-2.5 pr-11">
          <p className="truncate font-mono text-sm text-brand" title={shareUrl}>
            {shareUrl}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => void copyLink()}
            aria-label={copied ? t("shareCopied") : t("shareCopyButton")}
            title={t("shareCopyButton")}
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
      ) : null}

      {active && !shareUrl && !canReveal ? (
        <p className="text-xs text-muted-foreground">
          {t("shareShowUnavailable")}
        </p>
      ) : null}

      {modificationBlocked ? (
        <p className="text-sm text-muted-foreground">{tp("grantedLockShare")}</p>
      ) : null}

      {shareError ? (
        <p className="text-sm text-destructive" role="alert">
          {shareError}
        </p>
      ) : null}
    </SurfaceCard>
  );
}
