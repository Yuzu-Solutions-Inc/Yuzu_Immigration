import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  HorizontalBarList,
  SubmitTrendChart,
} from "@/components/home/caseload-charts";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
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
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import type { ProgramFamily, ProjectStatus } from "@/db/schema";
import { getHomeDashboard } from "@/lib/crm/dashboard";
import { formatDisplayDate, startOfIsoWeek } from "@/lib/crm/dates";
import { cn } from "@/lib/utils";

function timingLabel(
  days: number,
  t: Awaited<ReturnType<typeof getTranslations<"appHome">>>,
) {
  if (days < 0) return t("timing.overdue", { days: Math.abs(days) });
  if (days === 0) return t("timing.today");
  return t("timing.inDays", { days });
}

function timingClass(days: number) {
  if (days < 0) return "text-destructive";
  if (days <= 7) return "text-warning-text";
  return "text-muted-foreground";
}

function weekLabel(iso: string, locale: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { month: "short", day: "numeric" },
  );
}

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, membership, t, tp, tprog, dashboard] = await Promise.all([
    getSessionUser(),
    getPrimaryMembership(),
    getTranslations("appHome"),
    getTranslations("projects"),
    getTranslations("programs"),
    getHomeDashboard(),
  ]);
  const canCreate = canCreateRecords(membership?.role);
  const { kpis } = dashboard;
  const currentWeek = startOfIsoWeek();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand sm:text-3xl">
            {displayName
              ? t("welcome", { name: displayName })
              : t("welcomeFallback")}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {t("dashboardSubtitle")}
          </p>
        </div>
        {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
      </div>

      {!dashboard.hasCaseload ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("emptyProjects")}</p>
          {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
        </SurfaceCard>
      ) : (
        <>
          <section className="border-b border-border pb-8">
            <p className="font-heading text-2xl font-semibold tracking-tight text-brand sm:text-3xl">
              {kpis.dueIn14Days === 0
                ? t("dueIn14None")
                : t("dueIn14", { count: kpis.dueIn14Days })}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className={kpis.overdueSubmissions > 0 ? "text-destructive" : undefined}>
                {t("overdue", { count: kpis.overdueSubmissions })}
              </span>
              <span aria-hidden>·</span>
              <span>{t("docsToReview", { count: kpis.docsToReview })}</span>
              <span aria-hidden>·</span>
              <span>{t("stuckWaiting", { count: kpis.stuckWaiting })}</span>
            </p>
          </section>

          <section className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-heading text-base font-semibold text-brand">
                {t("charts.projectsByStatus")}
              </h2>
              <HorizontalBarList
                empty={t("charts.projectsByStatusEmpty")}
                items={dashboard.projectsByStatus.map((row) => ({
                  key: row.key,
                  label: tp(`statuses.${row.key as ProjectStatus}`),
                  count: row.count,
                }))}
              />
            </div>
            <div className="space-y-4">
              <h2 className="font-heading text-base font-semibold text-brand">
                {t("charts.peopleByVisa")}
              </h2>
              <HorizontalBarList
                empty={t("charts.peopleByVisaEmpty")}
                items={dashboard.peopleByVisa.map((row) => ({
                  key: row.key,
                  label: tprog(row.key as ProgramFamily),
                  count: row.count,
                }))}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-heading text-base font-semibold text-brand">
                {t("charts.submitTrend")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("charts.submitTrendHint")}
              </p>
            </div>
            <SubmitTrendChart
              empty={t("charts.submitTrendEmpty")}
              thisWeekLabel={t("charts.thisWeek")}
              points={dashboard.submitTrend.map((point) => ({
                weekStart: point.weekStart,
                label: weekLabel(point.weekStart, locale),
                count: point.count,
                isCurrent: point.weekStart === currentWeek,
              }))}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-base font-semibold text-brand">
                {t("upcoming.title")}
              </h2>
              <Link
                href="/projects"
                className="text-sm font-medium text-action hover:underline"
              >
                {t("viewAllProjects")}
              </Link>
            </div>
            {dashboard.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("upcoming.empty")}</p>
            ) : (
              <>
                <ul className="space-y-2 md:hidden">
                  {dashboard.upcoming.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="block space-y-2 rounded-xl border border-border bg-surface p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-brand">{item.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {tp(`statuses.${item.status}`)}
                            </p>
                          </div>
                          <p
                            className={cn(
                              "shrink-0 text-sm font-medium",
                              timingClass(item.days),
                            )}
                          >
                            {timingLabel(item.days, t)}
                          </p>
                        </div>
                        <div className="flex gap-4">
                          <ProgressMeter
                            valueLabel={t("upcoming.docs", {
                              done: item.docsDone,
                              total: item.docsTotal,
                            })}
                            percent={docsPercent(item.docsDone, item.docsTotal)}
                          />
                          <ProgressMeter
                            valueLabel={t("upcoming.forms", {
                              percent: item.formPercent,
                            })}
                            percent={item.formPercent}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("upcoming.columns.project")}</TableHead>
                      <TableHead>{t("upcoming.columns.due")}</TableHead>
                      <TableHead>{t("upcoming.columns.documents")}</TableHead>
                      <TableHead>{t("upcoming.columns.forms")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.upcoming.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal">
                          <Link
                            href={item.href}
                            className="font-medium text-brand hover:underline"
                          >
                            {item.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {tp(`statuses.${item.status}`)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p
                            className={cn(
                              "text-sm font-medium",
                              timingClass(item.days),
                            )}
                          >
                            {timingLabel(item.days, t)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDisplayDate(item.submitBefore, locale)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <ProgressMeter
                            valueLabel={t("upcoming.docs", {
                              done: item.docsDone,
                              total: item.docsTotal,
                            })}
                            percent={docsPercent(item.docsDone, item.docsTotal)}
                          />
                        </TableCell>
                        <TableCell>
                          <ProgressMeter
                            valueLabel={t("upcoming.forms", {
                              percent: item.formPercent,
                            })}
                            percent={item.formPercent}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
