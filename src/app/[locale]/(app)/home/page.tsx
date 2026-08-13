import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { ProjectStatusSummary } from "@/components/projects/project-status-summary";
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
import {
  getHomeDashboard,
  type HomeActionItem,
  type HomeActionKind,
} from "@/lib/crm/dashboard";
import { daysUntilIso, formatDisplayDate } from "@/lib/crm/dates";
import { cn } from "@/lib/utils";

function timingLabel(
  days: number,
  t: Awaited<ReturnType<typeof getTranslations<"appHome">>>,
) {
  if (days < 0) return t("expiries.overdue", { days: Math.abs(days) });
  if (days === 0) return t("expiries.today");
  return t("expiries.inDays", { days });
}

function timingClass(days: number) {
  if (days < 0) return "text-destructive";
  if (days <= 7) return "text-[#b45309]";
  return "text-muted-foreground";
}

function actionDocLabel(
  item: HomeActionItem,
  tDocs: Awaited<ReturnType<typeof getTranslations<"documents">>>,
) {
  if (item.docKey === "passport" || item.docKey === "photo") {
    return tDocs(`keys.${item.docKey}`);
  }
  return item.customLabel || tDocs("customFallback");
}

function actionKindLabel(
  kind: HomeActionKind,
  t: Awaited<ReturnType<typeof getTranslations<"appHome">>>,
) {
  switch (kind) {
    case "doc_review":
      return t("actions.kinds.doc_review");
    case "stuck":
      return t("actions.kinds.stuck");
    case "waiting":
      return t("actions.kinds.waiting");
    case "submit_overdue":
      return t("actions.kinds.submit_overdue");
    case "expiry_overdue":
      return t("actions.kinds.expiry_overdue");
    case "share_expiring":
      return t("actions.kinds.share_expiring");
  }
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full",
          pct >= 100 ? "bg-emerald-600" : "bg-action",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function KpiCard({
  href,
  label,
  value,
  hint,
  tone = "default",
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "warning" | "danger";
}) {
  const highlight = value > 0 && tone !== "default";
  const className = cn(
    "block rounded-xl border bg-surface p-4 shadow-elevated transition-colors sm:p-5",
    highlight && tone === "danger"
      ? "border-destructive/30 hover:bg-destructive/5"
      : highlight && tone === "warning"
        ? "border-amber-200 hover:bg-amber-50/60"
        : "border-border hover:bg-muted/50",
  );

  const inner = (
    <>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-heading mt-1 text-3xl font-semibold",
          highlight && tone === "danger"
            ? "text-destructive"
            : highlight && tone === "warning"
              ? "text-[#b45309]"
              : "text-brand",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </>
  );

  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, membership, t, tp, tprog, ti, tDocs, dashboard] = await Promise.all([
    getSessionUser(),
    getPrimaryMembership(),
    getTranslations("appHome"),
    getTranslations("projects"),
    getTranslations("programs"),
    getTranslations("immigrationStatus"),
    getTranslations("documents"),
    getHomeDashboard(),
  ]);
  const canCreate = canCreateRecords(membership?.role);
  const { kpis, hasCaseload } = dashboard;

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
          <p className="text-[15px] text-muted-foreground">
            {t("dashboardSubtitle")}
          </p>
        </div>
        {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          href="/projects"
          label={t("stats.openFiles")}
          value={kpis.openFiles}
          hint={
            kpis.submitted > 0
              ? t("stats.openFilesHintSubmitted", { count: kpis.submitted })
              : t("stats.openFilesHint")
          }
        />
        <KpiCard
          href="#actions"
          label={t("stats.needsAttention")}
          value={kpis.needsAttention}
          hint={t("stats.needsAttentionHint")}
          tone="warning"
        />
        <KpiCard
          href="#actions"
          label={t("stats.docsToReview")}
          value={kpis.docsToReview}
          hint={t("stats.docsToReviewHint")}
          tone="warning"
        />
        <KpiCard
          href="#deadlines"
          label={t("stats.deadlines")}
          value={kpis.deadlinesSoon}
          hint={t("stats.deadlinesHint")}
          tone="warning"
        />
        <KpiCard
          href="#expiries"
          label={t("stats.expiries")}
          value={kpis.expiriesSoon}
          hint={t("stats.expiriesHint")}
          tone="danger"
        />
        <KpiCard
          href="#awaiting"
          label={t("stats.awaitingClient")}
          value={kpis.awaitingClient}
          hint={t("stats.awaitingClientHint")}
        />
      </section>

      {!hasCaseload ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("emptyProjects")}</p>
          {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
        </SurfaceCard>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-5">
            <div id="actions" className="scroll-mt-20 space-y-3 lg:col-span-3">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("actions.title")}
              </h2>
              {dashboard.actions.length === 0 ? (
                <SurfaceCard className="sm:p-5">
                  <p className="text-[15px] text-muted-foreground">
                    {t("actions.empty")}
                  </p>
                </SurfaceCard>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
                  {dashboard.actions.map((item) => {
                    const days = item.days;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold tracking-wide uppercase",
                                  item.kind === "submit_overdue" ||
                                    item.kind === "expiry_overdue"
                                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                                    : "border-border text-muted-foreground",
                                )}
                              >
                                {actionKindLabel(item.kind, t)}
                              </span>
                              <p className="truncate font-medium text-brand">
                                {item.title}
                              </p>
                            </div>
                            {item.kind === "doc_review" ? (
                              <p className="text-sm text-muted-foreground">
                                {t("actions.docReviewDetail", {
                                  doc: actionDocLabel(item, tDocs),
                                  person: item.personName ?? "—",
                                })}
                              </p>
                            ) : null}
                          </div>
                          {item.date ? (
                            <p
                              className={cn(
                                "shrink-0 text-sm font-medium",
                                days === null
                                  ? "text-muted-foreground"
                                  : timingClass(days),
                              )}
                            >
                              {days === null
                                ? formatDisplayDate(item.date, locale)
                                : timingLabel(days, t)}
                            </p>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div id="awaiting" className="scroll-mt-20 space-y-3 lg:col-span-2">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("awaiting.title")}
              </h2>
              {dashboard.awaiting.length === 0 ? (
                <SurfaceCard className="sm:p-5">
                  <p className="text-sm text-muted-foreground">
                    {t("awaiting.empty")}
                  </p>
                </SurfaceCard>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
                  {dashboard.awaiting.map((item) => (
                    <li key={item.projectId}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-brand">
                            {item.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("awaiting.docs", { count: item.outstanding })}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div id="deadlines" className="scroll-mt-20 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading text-lg font-semibold text-brand">
                  {t("deadlines.title")}
                </h2>
                <Link
                  href="/projects"
                  className="text-sm font-medium text-action hover:underline"
                >
                  {t("viewAllProjects")}
                </Link>
              </div>
              {dashboard.deadlines.length === 0 ? (
                <SurfaceCard className="sm:p-5">
                  <p className="text-sm text-muted-foreground">
                    {t("deadlines.empty")}
                  </p>
                </SurfaceCard>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
                  {dashboard.deadlines.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-brand">
                            {item.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDisplayDate(item.date, locale)}
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
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div id="expiries" className="scroll-mt-20 space-y-3">
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
              {dashboard.expiries.length === 0 ? (
                <SurfaceCard className="sm:p-5">
                  <p className="text-sm text-muted-foreground">
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
                        <TableHead className="text-right">
                          {t("expiries.columns.timing")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.expiries.map((person) => {
                        const expiry = person.status_expires_at!;
                        const days = daysUntilIso(expiry);
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
                            <TableCell
                              className={cn(
                                "text-right text-sm font-medium",
                                timingClass(days),
                              )}
                            >
                              {timingLabel(days, t)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-3 lg:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading text-lg font-semibold text-brand">
                  {t("active.title")}
                </h2>
                <Link
                  href="/projects"
                  className="text-sm font-medium text-action hover:underline"
                >
                  {t("viewAllProjects")}
                </Link>
              </div>
              {dashboard.activeFiles.length === 0 ? (
                <SurfaceCard className="sm:p-5">
                  <p className="text-sm text-muted-foreground">
                    {t("active.empty")}
                  </p>
                </SurfaceCard>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
                  {dashboard.activeFiles.map(
                    ({ project, formsDone, formsTotal, docsDone, docsTotal }) => (
                      <li key={project.id}>
                        <Link
                          href={`/projects/${project.id}`}
                          className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-brand">
                                {project.title}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {tprog(project.program_family)}
                                {project.jurisdiction !== "federal"
                                  ? ` · ${tp(`jurisdictions.${project.jurisdiction}`)}`
                                  : ""}
                              </p>
                            </div>
                            <ProjectStatusSummary
                              status={project.status}
                              statusAt={project.status_at}
                              locale={locale}
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                {t("active.forms", {
                                  done: formsDone,
                                  total: formsTotal,
                                })}
                              </p>
                              <ProgressBar done={formsDone} total={formsTotal} />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                {t("active.docs", {
                                  done: docsDone,
                                  total: docsTotal,
                                })}
                              </p>
                              <ProgressBar done={docsDone} total={docsTotal} />
                            </div>
                          </div>
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            <div className="space-y-3 lg:col-span-2">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("activity.title")}
              </h2>
              {dashboard.activity.length === 0 ? (
                <SurfaceCard className="sm:p-5">
                  <p className="text-sm text-muted-foreground">
                    {t("activity.empty")}
                  </p>
                </SurfaceCard>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
                  {dashboard.activity.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/projects/${item.projectId}`}
                        className="block px-5 py-3.5 transition-colors hover:bg-muted/60"
                      >
                        <p className="truncate font-medium text-brand">
                          {item.projectTitle}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t("activity.changedTo", {
                            status: tp(`statuses.${item.status}`),
                          })}
                          {" · "}
                          {formatDisplayDate(item.statusAt, locale)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
