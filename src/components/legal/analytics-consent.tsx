"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export const ANALYTICS_CONSENT_COOKIE = "yuzu_analytics_consent";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type ConsentValue = "accepted" | "refused";

function readConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`));
  const value = match?.split("=")[1];
  if (value === "accepted" || value === "refused") return value;
  return null;
}

function writeConsent(value: ConsentValue) {
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Optional Vercel analytics stay off until the visitor opts in (Law 25 ss. 8.1 / 9.1). */
export function AnalyticsConsent() {
  const t = useTranslations("legal.analyticsConsent");
  const [choice, setChoice] = useState<ConsentValue | null | "unknown">(
    "unknown",
  );

  useEffect(() => {
    setChoice(readConsent());
  }, []);

  const decide = useCallback((value: ConsentValue) => {
    writeConsent(value);
    setChoice(value);
  }, []);

  if (choice === "unknown") return null;

  return (
    <>
      {choice === "accepted" ? (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      ) : null}
      {choice === null ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-border bg-surface p-4 shadow-elevated">
            <p className="text-sm leading-relaxed text-foreground text-pretty">
              {t("body")}{" "}
              <Link
                href="/privacy#cookies"
                className="text-action underline-offset-2 hover:underline"
              >
                {t("privacyLink")}
              </Link>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => decide("accepted")}>
                {t("accept")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => decide("refused")}
              >
                {t("refuse")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
