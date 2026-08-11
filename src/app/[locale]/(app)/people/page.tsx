import { getTranslations, setRequestLocale } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { listPeople } from "@/lib/crm/queries";

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
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      {people.length === 0 ? (
        <SurfaceCard>
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
        </SurfaceCard>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {people.map((person) => (
            <li key={person.id}>
              <Link
                href={`/people/${person.id}`}
                className="flex flex-col gap-0.5 px-5 py-4 transition-colors hover:bg-muted/60"
              >
                <p className="font-medium text-brand">
                  {person.first_name} {person.last_name}
                </p>
                {person.email ? (
                  <p className="text-sm text-muted-foreground">{person.email}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
