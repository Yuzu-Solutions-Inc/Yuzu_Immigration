import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { PortalLoginGate } from "@/components/portal/portal-login-gate";
import { getPortalSession, labelPortalPerson } from "@/lib/portal/auth";
import { portalGoogleConfigured } from "@/lib/google/portal-oauth";
import {
  findPortalGoogleMatches,
  readPortalGooglePending,
} from "@/lib/portal/google";

export default async function PortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; google?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const session = await getPortalSession();
  if (session) {
    redirect({ href: "/portal/home", locale });
  }

  const pending = await readPortalGooglePending();
  let googleStep: "choose_org" | "needs_legal" | undefined;
  if (pending) {
    if (query.google === "choose") googleStep = "choose_org";
    else if (query.google === "legal" || pending.personId) {
      googleStep = "needs_legal";
    } else {
      googleStep = "choose_org";
    }
  }

  const matches =
    pending && googleStep === "choose_org"
      ? await findPortalGoogleMatches(pending)
      : [];
  const legalMatch =
    pending &&
    googleStep === "needs_legal" &&
    pending.personId &&
    pending.organizationId
      ? await labelPortalPerson(pending.personId, pending.organizationId)
      : null;

  return (
    <PortalLoginGate
      locale={locale}
      mode="needs_password_login"
      organizationName={legalMatch?.organizationName}
      initialError={
        query.error === "google" || query.error === "rate_limited"
          ? query.error
          : undefined
      }
      googleLoginAvailable={portalGoogleConfigured()}
      googleStep={
        googleStep === "choose_org" || googleStep === "needs_legal"
          ? googleStep
          : undefined
      }
      googlePersonId={pending?.personId}
      googleOrganizationId={pending?.organizationId}
      googleOrganizations={matches.map((row) => ({
        personId: row.personId,
        organizationId: row.organizationId,
        label:
          row.personLabel && row.organizationName
            ? `${row.personLabel} · ${row.organizationName}`
            : row.organizationName || row.personLabel,
      }))}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  return { title: t("title") };
}
