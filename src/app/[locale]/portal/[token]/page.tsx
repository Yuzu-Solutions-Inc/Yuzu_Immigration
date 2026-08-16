import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { PortalLoginGate } from "@/components/portal/portal-login-gate";
import {
  getPortalAccessState,
  getPortalSession,
} from "@/lib/portal/auth";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PortalMagicLinkPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  if (!UUID_RE.test(token)) notFound();

  const resolved = await getPortalAccessState(token);
  if (!resolved) {
    const session = await getPortalSession();
    if (session) {
      redirect({ href: "/portal/home", locale });
    }
    return (
      <PortalLoginGate
        locale={locale}
        mode="needs_password_login"
        initialError="invalid"
      />
    );
  }

  if (resolved.state === "authenticated") {
    redirect({ href: "/portal/home", locale });
  }

  const admin = createServiceClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", resolved.access.organization_id)
    .maybeSingle();

  return (
    <PortalLoginGate
      locale={locale}
      mode={
        resolved.state === "needs_password_setup"
          ? "needs_password_setup"
          : "needs_password_login"
      }
      token={token}
      organizationName={String(org?.name ?? "")}
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
