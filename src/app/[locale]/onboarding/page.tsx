import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CreateOrganizationForm } from "@/components/org/create-organization-form";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { Link } from "@/i18n/navigation";

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

  const membership = await getPrimaryMembership();
  if (membership) {
    redirect(`/${locale}/home`);
  }

  const t = await getTranslations("onboarding");
  const app = await getTranslations("app");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.08em] uppercase">
          {app("name")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-pretty">{t("subtitle")}</p>
      </div>

      <CreateOrganizationForm locale={locale as "en" | "fr"} />

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/home" className="underline underline-offset-4">
          ←
        </Link>
      </p>
    </main>
  );
}
