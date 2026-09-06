import { getTranslations, setRequestLocale } from "next-intl/server";

import { PartnersList } from "@/components/partners/partners-list";
import { SurfaceCard } from "@/components/layout/surface-card";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listPartnersAction } from "@/app/actions/finance-partners";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { cn } from "@/lib/utils";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const membership = await getPrimaryMembership();
  const t = await getTranslations("financeApp");
  const rows = await listPartnersAction();
  const canCreate = canCreateInWorkspace(membership);
  const immigrationOn = isModuleEnabled(
    membership?.enabledModules ?? [],
    "immigration",
  );

  return (
    <div className={listPageClassName}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className={listPageHeaderClassName}>
          <h1 className={listPageTitleClassName}>{t("partners.title")}</h1>
          <p className={listPageSubtitleClassName}>{t("partners.subtitle")}</p>
        </div>
        {canCreate ? (
          <Link
            href="/partners/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            {t("partners.new")}
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("partners.empty")}</p>
          {canCreate ? (
            <Link href="/partners/new" className={cn(buttonVariants({ size: "sm" }))}>
              {t("partners.new")}
            </Link>
          ) : null}
        </SurfaceCard>
      ) : (
        <PartnersList
          locale={locale}
          initial={rows}
          immigrationOn={immigrationOn}
          canDelete={canCreate}
        />
      )}
    </div>
  );
}
