import { getTranslations, setRequestLocale } from "next-intl/server";

import { unsubscribeTrialEmailsAction } from "@/app/actions/trial-unsubscribe";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import {
  trialEmailUnsubscribed,
  verifyTrialUnsubscribeToken,
} from "@/lib/email/trial-unsubscribe";

export const dynamic = "force-dynamic";

export default async function TrialUnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string; done?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { t: token = "", done, error } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("trialUnsubscribe");
  const userId = verifyTrialUnsubscribeToken(token);
  const already = userId ? await trialEmailUnsubscribed(userId) : false;
  const unsubscribed = done === "1" || already;
  const invalid = !userId || error === "1";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <BrandLogo size="sm" href="/" />
      <SurfaceCard>
        {unsubscribed && userId ? (
          <>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {t("doneTitle")}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {t("doneBody")}
            </p>
          </>
        ) : invalid ? (
          <>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {t("invalidTitle")}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {t("invalidBody")}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {t("title")}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {t("body")}
            </p>
            <form action={unsubscribeTrialEmailsAction} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit">{t("button")}</Button>
            </form>
          </>
        )}
      </SurfaceCard>
    </main>
  );
}
