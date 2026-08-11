import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import {
  listPeople,
  listProjects,
  listUpcomingStatusExpiries,
} from "@/lib/crm/queries";
import { cn } from "@/lib/utils";

function formatDate(isoDate: string, locale: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

function daysUntil(isoDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T12:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  const t = await getTranslations("appHome");
  const tp = await getTranslations("projects");
  const tprog = await getTranslations("programs");
  const ti = await getTranslations("immigrationStatus");

  const [projects, people, expiries] = await Promise.all([
    listProjects(),
    listPeople(),
    listUpcomingStatusExpiries(15),
  ]);
  const recent = projects.slice(0, 5);
  const inProgressCount = projects.filter(
    (p) => p.status === "in_progress" || p.status === "new",
  ).length;
  const blockedCount = projects.filter(
    (p) => p.status === "stuck" || p.status === "waiting",
  ).length;

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand sm:text-3xl">
            {displayName
              ? t("welcome", { name: displayName })
              : t("welcomeFallback")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("dashboardSubtitle")}</p>
        </div>
        <NewProjectButton label={t("newProject")} />
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <SurfaceCard className="space-y-1 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("stats.activeProjects")}
          </p>
          <p className="font-heading text-3xl font-semibold text-brand">
            {inProgressCount}
          </p>
        </SurfaceCard>
        <SurfaceCard className="space-y-1 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("stats.people")}
          </p>
          <p className="font-heading text-3xl font-semibold text-brand">
            {people.length}
          </p>
        </SurfaceCard>
        <SurfaceCard className="space-y-1 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("stats.blocked")}
          </p>
          <p className="font-heading text-3xl font-semibold text-brand">
            {blockedCount}
          </p>
        </SurfaceCard>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("expiries.title")}
          </h2>
          <Link
            href="/people"
            className="text-sm font-medium text-action hover:underline"
          >
            {t("expiries.viewPeople")}
          </Link>
        </div>

        {expiries.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">
              {t("expiries.empty")}
            </p>
          </SurfaceCard>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("expiries.columns.person")}</TableHead>
                  <TableHead>{t("expiries.columns.status")}</TableHead>
                  <TableHead>{t("expiries.columns.expires")}</TableHead>
                  <TableHead className="text-right">
                    {t("expiries.columns.timing")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiries.map((person) => {
                  const expiry = person.status_expires_at!;
                  const days = daysUntil(expiry);
                  const timing =
                    days < 0
                      ? t("expiries.overdue", { days: Math.abs(days) })
                      : days === 0
                        ? t("expiries.today")
                        : t("expiries.inDays", { days });

                  return (
                    <TableRow key={person.id}>
                      <TableCell>
                        <Link
                          href={`/people/${person.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {person.first_name} {person.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {ti(person.immigration_status)}
                      </TableCell>
                      <TableCell>{formatDate(expiry, locale)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm font-medium",
                          days < 0
                            ? "text-destructive"
                            : days <= 30
                              ? "text-[#b45309]"
                              : "text-muted-foreground",
                        )}
                      >
                        {timing}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("recentProjects")}
            </h2>
            <Link
              href="/projects"
              className="text-sm font-medium text-action hover:underline"
            >
              {t("viewAllProjects")}
            </Link>
          </div>

          {recent.length === 0 ? (
            <SurfaceCard className="space-y-3">
              <p className="text-[15px] text-muted-foreground">
                {t("emptyProjects")}
              </p>
              <NewProjectButton label={t("newProject")} />
            </SurfaceCard>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
              {recent.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-brand">{project.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {tprog(project.program_family)} ·{" "}
                        {tp(`jurisdictions.${project.jurisdiction}`)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {tp(`statuses.${project.status}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <SurfaceCard className="space-y-2 sm:p-5">
            <h2 className="font-heading text-base font-semibold text-brand">
              {t("placeholders.activityTitle")}
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              {t("placeholders.activityBody")}
            </p>
          </SurfaceCard>
        </div>
      </section>
    </div>
  );
}
