import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { DeletePersonButton } from "@/components/people/delete-person-button";
import { SurfaceCard } from "@/components/layout/surface-card";
import { ProjectStatusSummary } from "@/components/projects/project-status-summary";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getPerson, getPersonProjects } from "@/lib/crm/queries";
import { cn } from "@/lib/utils";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const person = await getPerson(id);
  if (!person) notFound();

  const projects = await getPersonProjects(id);
  const t = await getTranslations("people");
  const ti = await getTranslations("immigrationStatus");
  const tprog = await getTranslations("programs");
  const tr = await getTranslations("roles");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/people"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {person.first_name} {person.last_name}
            </h1>
            <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
              {person.email ? (
                <div>
                  <dt className="inline font-medium text-brand/70">
                    {t("email")}:{" "}
                  </dt>
                  <dd className="inline">{person.email}</dd>
                </div>
              ) : null}
              {person.phone ? (
                <div>
                  <dt className="inline font-medium text-brand/70">
                    {t("phone")}:{" "}
                  </dt>
                  <dd className="inline">{person.phone}</dd>
                </div>
              ) : null}
              <div>
                <dt className="inline font-medium text-brand/70">
                  {t("immigrationStatus")}:{" "}
                </dt>
                <dd className="inline">
                  {ti(person.immigration_status)}
                  {person.status_expires_at
                    ? ` · ${t("expires", {
                        date: new Date(
                          `${person.status_expires_at}T12:00:00`,
                        ).toLocaleDateString(
                          locale === "fr" ? "fr-CA" : "en-CA",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        ),
                      })}`
                    : ""}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/people/${person.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("edit")}
            </Link>
            <Link
              href={`/projects/new?person=${person.id}`}
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-action text-white hover:bg-action/90",
              )}
            >
              {t("newProject")}
            </Link>
            <DeletePersonButton
              locale={locale}
              personId={person.id}
              fullName={`${person.first_name} ${person.last_name}`}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("projects")}
        </h2>
        {projects.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">{t("noProjects")}</p>
          </SurfaceCard>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-brand">{project.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {tprog(project.program_family)} · {tr(project.role)}
                    </p>
                  </div>
                  <ProjectStatusSummary
                    status={project.status}
                    statusAt={project.status_at}
                    locale={locale}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
