import { getTranslations, setRequestLocale } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { Link } from "@/i18n/navigation";
import { listPeople } from "@/lib/crm/queries";

export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const { locale } = await params;
  const { person: presetPersonId } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("projects");
  const people = await listPeople();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/projects"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("createTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("createSubtitle")}</p>
      </div>

      <SurfaceCard>
        <CreateProjectForm
          locale={locale === "fr" ? "fr" : "en"}
          people={people}
          presetPersonId={presetPersonId}
        />
      </SurfaceCard>
    </div>
  );
}
