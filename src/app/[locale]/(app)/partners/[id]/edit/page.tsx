import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { EditPersonForm } from "@/components/people/edit-person-form";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { partnerDetailPath } from "@/lib/crm/contact-paths";
import { ensurePartnerForPerson } from "@/lib/crm/partner-person";
import { getPerson, getPersonByPartnerId } from "@/lib/crm/queries";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { requireImmigrationWorkspace } from "@/lib/modules/require-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function EditPartnerPersonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireImmigrationWorkspace(locale);

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) redirect(`/${locale}/onboarding`);

  const supabase = await createClient();
  const orgId = membership.organization.id;

  let person = await getPersonByPartnerId(id);
  let partnerId = id;

  if (!person) {
    const existing = await getPerson(id);
    if (!existing) notFound();
    const linked = await ensurePartnerForPerson(
      { supabase, orgId, userId: user.id },
      existing.id,
    );
    if (!linked) notFound();
    redirect(`/${locale}${partnerDetailPath(linked)}/edit`);
  }

  if (!isModuleEnabled(membership.enabledModules, "immigration")) {
    redirect(`/${locale}${partnerDetailPath(partnerId)}`);
  }

  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}${partnerDetailPath(partnerId)}`);
  }

  const t = await getTranslations("people");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href={partnerDetailPath(partnerId)}
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToPerson")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("editTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("editSubtitle")}</p>
      </div>

      <SurfaceCard>
        <EditPersonForm
          locale={locale === "fr" ? "fr" : "en"}
          person={person}
        />
      </SurfaceCard>
    </div>
  );
}
