import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { PartnerForm } from "@/components/partners/partner-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { partnerDetailPath } from "@/lib/crm/contact-paths";
import { getPersonByPartnerId } from "@/lib/crm/queries";
import type { Partner } from "@/lib/finance/types";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { decryptOrgPayload } from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}${partnerDetailPath(id)}`);
  }

  const supabase = await createClient();
  const orgId = membership.organization.id;
  const { data: partnerRow } = await supabase
    .from("partners")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (!partnerRow) notFound();

  const key = await getOrgDataKey(orgId);
  const partner = decryptOrgPayload("partners", partnerRow as Partner, key);
  const person = await getPersonByPartnerId(partner.id);
  const t = await getTranslations("financeApp");
  const financeOn = isModuleEnabled(membership.enabledModules, "finance");
  const immigrationOn = isModuleEnabled(membership.enabledModules, "immigration");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href={partnerDetailPath(partner.id)}
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("partners.backToPartner")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("partners.edit")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("partners.editSubtitle")}</p>
      </div>

      <SurfaceCard>
        <PartnerForm
          locale={locale}
          partner={partner}
          person={person}
          financeOn={financeOn}
          immigrationOn={immigrationOn}
        />
      </SurfaceCard>
    </div>
  );
}
