import { getTranslations, setRequestLocale } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { PeopleList } from "@/components/people/people-list";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listPeople } from "@/lib/crm/queries";
import { cn } from "@/lib/utils";

function NewPersonButton({ label }: { label: string }) {
  return (
    <Link
      href="/clients/new"
      className={cn(
        buttonVariants({ size: "sm" }),
        "bg-action text-action-foreground hover:bg-action/90",
      )}
    >
      {label}
    </Link>
  );
}

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("people");
  const membership = await getPrimaryMembership();
  const canCreate = canCreateRecords(membership?.role);
  const people = await listPeople();

  return (
    <div className={listPageClassName}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className={listPageHeaderClassName}>
          <h1 className={listPageTitleClassName}>
            {t("title")}
          </h1>
          <p className={listPageSubtitleClassName}>{t("subtitle")}</p>
        </div>
        {canCreate ? <NewPersonButton label={t("new")} /> : null}
      </div>

      {people.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
          {canCreate ? <NewPersonButton label={t("new")} /> : null}
        </SurfaceCard>
      ) : (
        <PeopleList locale={locale} people={people} />
      )}
    </div>
  );
}
