import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { CreateOrganizationForm } from "@/components/org/create-organization-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  await acceptPendingInvitationsForUser();

  const membership = await getPrimaryMembership();
  if (membership) {
    redirect(`/${locale}/home`);
  }

  const t = await getTranslations("onboarding");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-14">
      <div className="space-y-3">
        <BrandLogo size="sm" href={null} />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground text-pretty">
          {t("subtitle")}
        </p>
      </div>

      <SurfaceCard>
        <CreateOrganizationForm locale={locale as "en" | "fr"} />
      </SurfaceCard>
    </main>
  );
}
