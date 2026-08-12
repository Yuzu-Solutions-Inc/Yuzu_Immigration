import { getTranslations, setRequestLocale } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import { PeopleList } from "@/components/people/people-list";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listPeople } from "@/lib/crm/queries";
import { cn } from "@/lib/utils";

function NewPersonButton({ label }: { label: string }) {
  return (
    <Link
      href="/people/new"
      className={cn(
        buttonVariants({ size: "sm" }),
        "bg-action text-white hover:bg-action/90",
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
  const people = await listPeople();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NewPersonButton label={t("new")} />
      </div>

      {people.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
          <NewPersonButton label={t("new")} />
        </SurfaceCard>
      ) : (
        <PeopleList locale={locale} people={people} />
      )}
    </div>
  );
}
