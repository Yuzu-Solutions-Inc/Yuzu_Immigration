import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { EditPersonForm } from "@/components/people/edit-person-form";
import { Link } from "@/i18n/navigation";
import { getPerson } from "@/lib/crm/queries";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const person = await getPerson(id);
  if (!person) notFound();

  const t = await getTranslations("people");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href={`/clients/${person.id}`}
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
