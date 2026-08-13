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
}: {
  locale: "en" | "fr";
  projectId: string;
  activeShareExpiresAt: string | null;
  canReveal: boolean;
}) {
  const t = useTranslations("forms");
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
  const copiedUrlRef = useRef<string | null>(null);

  const shareUrl = shareState.shareUrl ?? revealState.shareUrl ?? null;
  const active = Boolean(activeShareExpiresAt) || Boolean(shareUrl);
  const dateLocale = locale === "fr" ? "fr-CA" : "en-CA";
  const expiresLabel = activeShareExpiresAt
    ? new Date(activeShareExpiresAt).toLocaleDateString(dateLocale)
    : shareState.expiresAt
      ? new Date(shareState.expiresAt).toLocaleDateString(dateLocale)
      : null;

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
        }[
          (shareState.error ||
            revealState.error ||
            revokeState.error) as string
        ] ?? t("errors.shareFailed")
      : null;

  return (
    <SurfaceCard className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("shareTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("shareHelp")}</p>
      </div>

      {active && expiresLabel ? (
        <p className="text-sm text-brand">
          {t("shareActive", { date: expiresLabel })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("shareInactive")}</p>
      )}

      {shareUrl ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("shareCopy")}
          </p>
          <div className="group relative rounded-xl border border-border bg-canvas p-3 pr-12">
            <p className="break-all font-mono text-sm text-brand">{shareUrl}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void copyLink()}
              aria-label={copied ? t("shareCopied") : t("shareCopyButton")}
              title={t("shareCopyButton")}
              className={cn(
                "absolute top-2 right-2 text-muted-foreground hover:text-brand",
                "opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
              )}
            >
              {copied ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {copied && shareUrl ? (
        <p className="text-sm font-medium text-emerald-700" role="status">
          {t("shareCopied")}
        </p>
      ) : null}

      {active && !shareUrl && !canReveal ? (
        <p className="text-sm text-muted-foreground">{t("shareShowUnavailable")}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {active && !shareUrl && canReveal ? (
          <form action={revealAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="outline" disabled={revealPending}>
              {revealPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("shareShowing")}
                </>
              ) : (
                t("shareShowLink")
              )}
            </Button>
          </form>
        ) : null}
        <form action={shareAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" disabled={sharePending}>
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
            <Button type="submit" variant="outline" disabled={revokePending}>
              {t("revokeShareLink")}
            </Button>
          </form>
        ) : null}
      </div>
      {shareError ? (
        <p className="text-sm text-destructive" role="alert">
          {shareError}
        </p>
      ) : null}
    </SurfaceCard>
  );
}
