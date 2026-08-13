import type { ProgramFamily, ProjectStatus } from "@/db/schema";
import {
  daysUntilIso,
  shiftIsoDate,
  startOfIsoWeek,
} from "@/lib/crm/dates";
import { PROGRAM_FAMILIES } from "@/lib/crm/programs";
import {
  getProjectsProgress,
  type ProjectProgress,
} from "@/lib/crm/progress";
import {
  listProjects,
  requireOrganizationId,
  type ProjectRow,
} from "@/lib/crm/queries";
import { isTerminalStatus, PROJECT_STATUSES } from "@/lib/crm/statuses";
import { createClient } from "@/lib/supabase/server";

export type ChartDatum = {
  key: string;
  count: number;
};

export type SubmitTrendPoint = {
  weekStart: string;
  count: number;
};

export type UpcomingSubmission = {
  id: string;
  title: string;
  href: string;
  submitBefore: string;
  days: number;
  status: ProjectStatus;
  docsDone: number;
  docsTotal: number;
  formPercent: number;
};

export type HomeDashboard = {
  hasCaseload: boolean;
  kpis: {
    dueIn14Days: number;
    overdueSubmissions: number;
    docsToReview: number;
    stuckWaiting: number;
  };
  projectsByStatus: ChartDatum[];
  peopleByVisa: ChartDatum[];
  submitTrend: SubmitTrendPoint[];
  upcoming: UpcomingSubmission[];
};

const EMPTY: HomeDashboard = {
  hasCaseload: false,
  kpis: {
    dueIn14Days: 0,
    overdueSubmissions: 0,
    docsToReview: 0,
    stuckWaiting: 0,
  },
  projectsByStatus: [],
  peopleByVisa: [],
  submitTrend: [],
  upcoming: [],
};

const TREND_WEEKS_BEFORE = 4;
const TREND_WEEKS_AFTER = 7;

function countBy<T extends string>(values: T[], order: readonly T[]): ChartDatum[] {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return order
    .map((key) => ({ key, count: counts.get(key) ?? 0 }))
    .filter((row) => row.count > 0);
}

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const orgId = await requireOrganizationId();
  if (!orgId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();

  const [projects, peopleCountResult, participantsResult] = await Promise.all([
    listProjects(),
    supabase
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("project_participants")
      .select("person_id, project_id")
      .eq("organization_id", orgId)
      .is("left_at", null)
      .limit(2000),
  ]);

  if (peopleCountResult.error) {
    console.error("getHomeDashboard people:", peopleCountResult.error.message);
  }
  if (participantsResult.error) {
    console.error(
      "getHomeDashboard participants:",
      participantsResult.error.message,
    );
  }

  const liveProjects = projects.filter((project) => !project.destroyed_at);
  const openProjects = liveProjects.filter(
    (project) => !isTerminalStatus(project.status),
  );
  const openIds = openProjects.map((project) => project.id);

  const [progress, uploadedResult] = await Promise.all([
    getProjectsProgress(liveProjects.map((project) => project.id)),
    openIds.length > 0
      ? supabase
          .from("project_document_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .eq("status", "uploaded")
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (uploadedResult.error) {
    console.error("getHomeDashboard uploaded:", uploadedResult.error.message);
  }

  const projectsByStatus = countBy(
    liveProjects.map((project) => project.status),
    PROJECT_STATUSES,
  );

  const projectById = new Map(liveProjects.map((project) => [project.id, project]));
  const visaByPerson = new Map<string, Set<ProgramFamily>>();
  for (const row of (participantsResult.data ?? []) as {
    person_id: string;
    project_id: string;
  }[]) {
    const project = projectById.get(row.project_id);
    if (!project || isTerminalStatus(project.status)) continue;
    const set = visaByPerson.get(row.person_id) ?? new Set<ProgramFamily>();
    set.add(project.program_family);
    visaByPerson.set(row.person_id, set);
  }

  const visaValues: ProgramFamily[] = [];
  for (const visas of visaByPerson.values()) {
    for (const visa of visas) visaValues.push(visa);
  }
  const peopleByVisa = countBy(visaValues, PROGRAM_FAMILIES);

  const currentWeek = startOfIsoWeek(now);
  const firstWeek = shiftIsoDate(currentWeek, -TREND_WEEKS_BEFORE * 7);
  const weekStarts: string[] = [];
  for (let i = 0; i < TREND_WEEKS_BEFORE + 1 + TREND_WEEKS_AFTER; i += 1) {
    weekStarts.push(shiftIsoDate(firstWeek, i * 7));
  }
  const lastWeek = weekStarts[weekStarts.length - 1]!;
  const trendEnd = shiftIsoDate(lastWeek, 6);

  const weekCounts = new Map(weekStarts.map((week) => [week, 0]));
  for (const project of liveProjects) {
    if (!project.submit_before) continue;
    if (project.submit_before < firstWeek || project.submit_before > trendEnd) {
      continue;
    }
    const week = startOfIsoWeek(new Date(`${project.submit_before}T12:00:00`));
    if (weekCounts.has(week)) {
      weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
    }
  }

  const submitTrend: SubmitTrendPoint[] = weekStarts.map((weekStart) => ({
    weekStart,
    count: weekCounts.get(weekStart) ?? 0,
  }));

  const datedOpen = openProjects.filter(
    (project): project is ProjectRow & { submit_before: string } =>
      Boolean(project.submit_before),
  );

  let dueIn14Days = 0;
  let overdueSubmissions = 0;
  for (const project of datedOpen) {
    const days = daysUntilIso(project.submit_before, now);
    if (days < 0) overdueSubmissions += 1;
    else if (days <= 14) dueIn14Days += 1;
  }

  const upcoming: UpcomingSubmission[] = [...datedOpen]
    .sort((a, b) => a.submit_before.localeCompare(b.submit_before))
    .slice(0, 5)
    .map((project) => {
      const stats: ProjectProgress = progress.get(project.id) ?? {
        docsDone: 0,
        docsTotal: 0,
        formPercent: 0,
      };
      return {
        id: project.id,
        title: project.title,
        href: `/projects/${project.id}`,
        submitBefore: project.submit_before,
        days: daysUntilIso(project.submit_before, now),
        status: project.status,
        docsDone: stats.docsDone,
        docsTotal: stats.docsTotal,
        formPercent: stats.formPercent,
      };
    });

  return {
    hasCaseload: liveProjects.length > 0 || (peopleCountResult.count ?? 0) > 0,
    kpis: {
      dueIn14Days,
      overdueSubmissions,
      docsToReview: uploadedResult.count ?? 0,
      stuckWaiting: liveProjects.filter(
        (project) => project.status === "stuck" || project.status === "waiting",
      ).length,
    },
    projectsByStatus,
    peopleByVisa,
    submitTrend,
    upcoming,
  };
}
