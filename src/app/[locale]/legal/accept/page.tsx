import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { SurfaceCard } from "@/components/layout/surface-card";
import { AcceptLegalForm } from "@/components/legal/accept-legal-form";
import { LegalLinks } from "@/components/legal/legal-links";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { hasAcceptedLegal } from "@/lib/legal/acceptance";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export const dynamic = "force-dynamic";

export default async function AcceptLegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  if (hasAcceptedLegal(user)) {
    const membership = await getPrimaryMembership();
    redirect(membership ? `/${locale}/home` : `/${locale}/onboarding`);
  }

  const t = await getTranslations("legal");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <div className="space-y-3 text-center sm:text-left">
        <BrandLogo size="sm" href={null} />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {t("acceptTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("acceptSubtitle")}</p>
      </div>

      <SurfaceCard>
        <AcceptLegalForm locale={locale} nextPath={next} />
      </SurfaceCard>

      <LegalLinks className="justify-center sm:justify-start" />
    </main>
  );
}
