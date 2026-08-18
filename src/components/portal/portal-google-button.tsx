"use client";

import { useTranslations } from "next-intl";

import { startPortalGoogleAction } from "@/app/actions/portal-auth";
import { GoogleLogo } from "@/components/brand/google-logo";
import { cn } from "@/lib/utils";

export function PortalGoogleSignInButton({
  locale,
  email,
  personId,
  organizationId,
  token,
  disabled,
  onBeforeRedirect,
}: {
  locale: string;
  email?: string;
  personId?: string;
  organizationId?: string;
  token?: string;
  disabled?: boolean;
  onBeforeRedirect?: () => void;
}) {
  const t = useTranslations("portal");

  return (
    <form
      action={startPortalGoogleAction}
      onSubmit={() => {
        onBeforeRedirect?.();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {email ? <input type="hidden" name="email" value={email} /> : null}
      {personId ? <input type="hidden" name="personId" value={personId} /> : null}
      {organizationId ? (
        <input type="hidden" name="organizationId" value={organizationId} />
      ) : null}
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <button
        type="submit"
        disabled={disabled}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 text-[15px] font-medium text-[#1F1F1F] transition-colors outline-none select-none",
          "hover:bg-[#f8f9fa] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <GoogleLogo />
        <span>{t("continueGoogle")}</span>
      </button>
    </form>
  );
}

export function PortalAuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
