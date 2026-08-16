"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { GoogleLogo } from "@/components/brand/google-logo";
import { cn } from "@/lib/utils";

export function GoogleSignInButton({
  locale,
  nextPath,
}: {
  locale: string;
  nextPath?: string;
}) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const origin = window.location.origin;
      const next = nextPath ?? `/${locale}/home`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (oauthError) {
        setError(t("googleFailed"));
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 text-[15px] font-medium text-[#1F1F1F] transition-colors outline-none select-none",
          "hover:bg-[#f8f9fa] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {pending ? null : <GoogleLogo />}
        <span>{pending ? t("redirecting") : t("continueGoogle")}</span>
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
