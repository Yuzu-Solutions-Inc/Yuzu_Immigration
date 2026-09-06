import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { enableImmigrationProfileAction } from "@/app/actions/people";
import { PersonImmigrationDetail } from "@/components/people/person-immigration-detail";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { partnerDetailPath } from "@/lib/crm/contact-paths";
import {
  ensurePartnerForPerson,
  shouldSyncImmigrationPerson,
} from "@/lib/crm/partner-person";
import { getPerson, getPersonByPartnerId } from "@/lib/crm/queries";
import type { Partner, PartnerKind } from "@/lib/finance/types";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { decryptOrgRow } from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);

  const user = await getSessionUser();
  const supabase = await createClient();
  const orgId = membership.organization.id;
  const immigrationOn = isModuleEnabled(membership.enabledModules, "immigration");
  const financeOn = isModuleEnabled(membership.enabledModules, "finance");

  const { data: partnerRow } = await supabase
    .from("partners")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();

  let partner = partnerRow
    ? decryptOrgRow("partners", partnerRow as Partner, await getOrgDataKey(orgId))
    : null;
  let person = partner ? await getPersonByPartnerId(partner.id) : null;

  if (!partner) {
    const existingPerson = await getPerson(id);
    if (!existingPerson || !user) notFound();
    const partnerId = await ensurePartnerForPerson(
      { supabase, orgId, userId: user.id },
      existingPerson.id,
    );
    if (!partnerId) notFound();
    redirect(`/${locale}${partnerDetailPath(partnerId)}`);
  }

  if (partner.id !== id) {
    redirect(`/${locale}${partnerDetailPath(partner.id)}`);
  }

  if (immigrationOn && person) {
    return (
      <PersonImmigrationDetail
        locale={locale}
        partnerId={partner.id}
        person={person}
      />
    );
  }

  const t = await getTranslations("financeApp.partners");
  const tp = await getTranslations("people");
  const canCreate = canCreateInWorkspace(membership);
  const kind = partner.kind as PartnerKind;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link
          href="/partners"
          className="inline-flex text-sm font-medium text-action hover:underline"
        >
          ← {tp("back")}
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand sm:text-3xl">
              {partner.legal_name}
            </h1>
            {partner.email ? (
              <p className="text-sm text-muted-foreground">{partner.email}</p>
            ) : null}
          </div>
          {financeOn ? (
            <Link
              href="/engagements/projects"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("engagementsLink")}
            </Link>
          ) : null}
        </div>
      </header>

      <SurfaceCard>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              {t("contact")}
            </dt>
            <dd className="mt-1 text-[15px] text-brand">
              {partner.contact_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              {t("phone")}
            </dt>
            <dd className="mt-1 text-[15px] text-brand">{partner.phone || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              {t("address")}
            </dt>
            <dd className="mt-1 text-[15px] text-brand">
              {[
                partner.address_line1,
                partner.city,
                partner.province,
                partner.postal_code,
                partner.country,
              ]
                .filter(Boolean)
                .join(", ") || "—"}
            </dd>
          </div>
        </dl>
      </SurfaceCard>

      {immigrationOn && !person && canCreate && shouldSyncImmigrationPerson(kind) ? (
        <SurfaceCard className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("enableImmigration")}
          </h2>
          <p className="text-[15px] text-muted-foreground">
            {t("enableImmigrationHelp")}
          </p>
          <form action={enableImmigrationProfileAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="partnerId" value={partner.id} />
            <Button type="submit" size="sm">
              {t("enableImmigration")}
            </Button>
          </form>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
