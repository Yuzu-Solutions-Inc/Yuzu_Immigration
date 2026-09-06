import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { getOnboardingState } from "@/lib/onboarding/status";

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const [membership, user, state] = await Promise.all([
    getPrimaryMembership(),
    getSessionUser(),
    getOnboardingState(),
  ]);
  if (!membership || !user) {
    redirect(membership ? `/${locale}/login` : `/${locale}/onboarding`);
  }

  const pending = state && !state.wizardCompleted && !state.wizardDismissed;
  redirect(pending ? `/${locale}/home?tour=1` : `/${locale}/home`);
}
