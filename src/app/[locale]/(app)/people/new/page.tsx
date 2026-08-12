import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { CreatePersonForm } from "@/components/people/create-person-form";
import { Link } from "@/i18n/navigation";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function NewPersonPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!canCreateRecords(membership?.role)) {
    redirect(`/${locale}/people`);
  }

  const t = await getTranslations("people");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/people"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("createTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("createSubtitle")}
        </p>
      </div>

      <SurfaceCard>
        <CreatePersonForm locale={toAppLocale(locale)} />
      </SurfaceCard>
    </div>
  );
}
