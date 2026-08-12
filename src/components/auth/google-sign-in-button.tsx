"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
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
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
      >
        {pending ? t("redirecting") : t("continueGoogle")}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
