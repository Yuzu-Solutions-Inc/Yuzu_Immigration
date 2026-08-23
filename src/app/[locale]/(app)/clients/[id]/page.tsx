import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { DeletePersonButton } from "@/components/people/delete-person-button";
import { PersonDetailTabs } from "@/components/people/person-detail-tabs";
import { PersonHomeTab } from "@/components/people/person-home-tab";
import { PersonNotesSection } from "@/components/people/person-notes-section";
import { PersonPortalCard } from "@/components/people/person-portal-card";
import { ExportPersonButton } from "@/components/privacy/retention-export";
import { SurfaceCard } from "@/components/layout/surface-card";
import { ProjectStatusSummary } from "@/components/projects/project-status-summary";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { canAdministerOrg, canDeleteRecord } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getAppBaseUrl } from "@/lib/app-url";
import { getBookingSettings } from "@/lib/booking/queries";
import { getPerson, getPersonProjects, listPersonMeetings } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import { portalBaseUrl } from "@/lib/portal/auth";
import { createClient } from "@/lib/supabase/server";
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

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  const canCreate = canCreateInWorkspace(membership);
  const canDelete = canDeleteRecord({
    role: membership?.role,
    createdBy: person.created_by,
    actorUserId: user?.id,
  });
  const [projects, meetings, portalAccess, baseUrl, bookingSettings] =
    await Promise.all([
      getPersonProjects(id),
      listPersonMeetings(id, locale),
      (async () => {
        const supabase = await createClient();
        const { data } = await supabase
          .from("customer_portal_access")
          .select("is_active, last_authenticated_at")
          .eq("person_id", id)
          .maybeSingle();
        return data as {
          is_active: boolean;
          last_authenticated_at: string | null;
        } | null;
      })(),
      getAppBaseUrl(),
      getBookingSettings(),
    ]);
  const t = await getTranslations("people");
  const ti = await getTranslations("immigrationStatus");
  const tprog = await getTranslations("programs");
  const tr = await getTranslations("roles");

  const dateLocale =
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA";
  const statusExpires = person.status_expires_at
    ? t("expires", {
        date: new Date(`${person.status_expires_at}T12:00:00`).toLocaleDateString(
          dateLocale,
          { year: "numeric", month: "short", day: "numeric" },
        ),
      })
    : null;
  const immigrationStatusLabel = statusExpires
    ? `${ti(person.immigration_status)} · ${statusExpires}`
    : ti(person.immigration_status);
  const sageAddressLabel = person.sage_contact_id
    ? person.sage_has_main_address
      ? t("sageAddressYes")
      : t("sageAddressNo")
    : t("sageNotLinked");
  const preferredLocale = toAppLocale(person.preferred_locale);

  return (
    <div>
      <header className="space-y-4 pb-5">
        <Link
          href="/clients"
          className="inline-flex text-sm font-medium text-action hover:underline"
        >
          ← {t("back")}
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand sm:text-3xl">
              {person.first_name} {person.last_name}
            </h1>
            {person.email ? (
              <p className="text-sm text-muted-foreground">{person.email}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {canAdministerOrg(membership?.role) ? (
              <ExportPersonButton personId={person.id} />
            ) : null}
            {canCreate ? (
              <Link
                href={`/clients/${person.id}/edit`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("edit")}
              </Link>
            ) : null}
            {canCreate ? (
              <Link
                href={`/projects/new?person=${person.id}`}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-action text-action-foreground hover:bg-action/90",
                )}
              >
                {t("newProject")}
              </Link>
            ) : null}
            {canDelete ? (
              <DeletePersonButton
                locale={locale}
                personId={person.id}
                fullName={`${person.first_name} ${person.last_name}`}
              />
            ) : null}
          </div>
        </div>
      </header>

      <section className="border-t border-border pt-6">
        <PersonDetailTabs
          panels={{
            home: (
              <PersonHomeTab
                personId={person.id}
                email={person.email || t("emptyValue")}
                phone={person.phone || t("emptyValue")}
                preferredLocaleLabel={t(`locales.${preferredLocale}`)}
                immigrationStatusLabel={immigrationStatusLabel}
                sageAddressLabel={sageAddressLabel}
                portal={
                  canCreate ? (
                    <PersonPortalCard
                      locale={locale}
                      personId={person.id}
                      hasEmail={Boolean(person.email)}
                      portalBaseUrl={portalBaseUrl(
                        baseUrl,
                        toAppLocale(person.preferred_locale),
                      )}
                      access={
                        portalAccess
                          ? {
                              isActive: portalAccess.is_active,
                              lastAuthenticatedAt:
                                portalAccess.last_authenticated_at,
                            }
                          : null
                      }
                    />
                  ) : null
                }
                projects={
                  projects.length === 0 ? (
                    <SurfaceCard>
                      <p className="text-[15px] text-muted-foreground">
                        {t("noProjects")}
                      </p>
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
                              <p className="font-medium text-brand">
                                {project.title}
                              </p>
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
                  )
                }
              />
            ),
            bookings: (
              <PersonNotesSection
                locale={locale}
                personId={person.id}
                meetings={meetings}
                timeZone={bookingSettings?.timezone ?? "America/Toronto"}
              />
            ),
          }}
        />
      </section>
    </div>
  );
}
