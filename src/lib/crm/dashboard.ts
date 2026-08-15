import {
  listProjects,
  requireOrganizationId,
  type PersonRow,
  type ProjectRow,
} from "@/lib/crm/queries";
import { isTerminalStatus, PROJECT_STATUSES } from "@/lib/crm/statuses";
import { addDaysToIsoDate, zonedDateIso } from "@/lib/booking/timezone";
import type { BookingAppointmentRow } from "@/lib/booking/types";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { createClient } from "@/lib/supabase/server";
import {
  decryptBookingGuestRow,
  decryptPersonRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
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
import type { ProgramFamily, ProjectStatus } from "@/db/schema";

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

export type DashboardAppointment = {
  id: string;
  guestName: string;
  serviceTitle: string | null;
  startsAt: string;
  endsAt: string;
  status: BookingAppointmentRow["status"];
};

export type StatusExpiryItem = {
  id: string;
  name: string;
  expiresAt: string;
  days: number;
  href: string;
};

export type BookingModuleSummary = {
  timezone: string;
  enabled: boolean;
  activeServices: number;
  hasAvailability: boolean;
  todayCount: number;
  next7Count: number;
  needsSetup: boolean;
};

export type HomeDashboard = {
  hasCaseload: boolean;
  kpis: {
    openProjects: number;
    dueIn14Days: number;
    overdueSubmissions: number;
    docsToReview: number;
    stuckWaiting: number;
    peopleCount: number;
    statusExpiring30: number;
  };
  booking: BookingModuleSummary;
  projectsByStatus: ChartDatum[];
  peopleByVisa: ChartDatum[];
  submitTrend: SubmitTrendPoint[];
  upcoming: UpcomingSubmission[];
  appointments: DashboardAppointment[];
  statusExpiries: StatusExpiryItem[];
};

const EMPTY: HomeDashboard = {
  hasCaseload: false,
  kpis: {
    openProjects: 0,
    dueIn14Days: 0,
    overdueSubmissions: 0,
    docsToReview: 0,
    stuckWaiting: 0,
    peopleCount: 0,
    statusExpiring30: 0,
  },
  booking: {
    timezone: "America/Toronto",
    enabled: false,
    activeServices: 0,
    hasAvailability: false,
    todayCount: 0,
    next7Count: 0,
    needsSetup: true,
  },
  projectsByStatus: [],
  peopleByVisa: [],
  submitTrend: [],
  upcoming: [],
  appointments: [],
  statusExpiries: [],
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

export async function getHomeDashboard(
  locale?: string | null,
): Promise<HomeDashboard> {
  const orgId = await requireOrganizationId();
  if (!orgId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();
  const key = await getOrgDataKey(orgId);

  const [
    projects,
    peopleCountResult,
    participantsResult,
    settingsResult,
    servicesResult,
    rulesResult,
    peopleExpiryResult,
  ] = await Promise.all([
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
    supabase
      .from("booking_settings")
      .select("timezone, is_enabled")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("booking_services")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("booking_availability_rules")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("people")
      .select("*")
      .eq("organization_id", orgId)
      .not("status_expires_at", "is", null)
      .neq("immigration_status", "none")
      .order("status_expires_at", { ascending: true })
      .limit(8),
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
  if (settingsResult.error) {
    console.error("getHomeDashboard settings:", settingsResult.error.message);
  }
  if (servicesResult.error) {
    console.error("getHomeDashboard services:", servicesResult.error.message);
  }
  if (rulesResult.error) {
    console.error("getHomeDashboard rules:", rulesResult.error.message);
  }
  if (peopleExpiryResult.error) {
    console.error(
      "getHomeDashboard status expiries:",
      peopleExpiryResult.error.message,
    );
  }

  const timezone =
    (settingsResult.data?.timezone as string | undefined) ?? "America/Toronto";
  const bookingEnabled = Boolean(settingsResult.data?.is_enabled);
  const activeServices = servicesResult.count ?? 0;
  const hasAvailability = (rulesResult.count ?? 0) > 0;
  const todayIso = zonedDateIso(now, timezone);
  const rangeEndIso = addDaysToIsoDate(todayIso, 7);
  const appointmentsFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const appointmentsTo = `${rangeEndIso}T23:59:59.999Z`;

  const liveProjects = projects.filter((project) => !project.destroyed_at);
  const openProjects = liveProjects.filter(
    (project) => !isTerminalStatus(project.status),
  );
  const openIds = openProjects.map((project) => project.id);

  const [progress, uploadedResult, appointmentsResult] = await Promise.all([
    getProjectsProgress(liveProjects.map((project) => project.id)),
    openIds.length > 0
      ? supabase
          .from("project_document_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .eq("status", "uploaded")
      : Promise.resolve({ count: 0, error: null }),
    supabase
      .from("booking_appointments")
      .select("*, service:booking_services(title, translations)")
      .eq("organization_id", orgId)
      .gte("starts_at", appointmentsFrom)
      .lt("starts_at", appointmentsTo)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(8),
  ]);

  if (uploadedResult.error) {
    console.error("getHomeDashboard uploaded:", uploadedResult.error.message);
  }
  if (appointmentsResult.error) {
    console.error(
      "getHomeDashboard appointments:",
      appointmentsResult.error.message,
    );
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

  const rawAppointments = (appointmentsResult.data ?? []) as Array<
    BookingAppointmentRow & {
      service?: { title: string; translations?: unknown } | null;
    }
  >;
  const appointments: DashboardAppointment[] = rawAppointments.map((row) => {
    const guest = decryptBookingGuestRow(row, key);
    return {
      id: row.id,
      guestName: guest.guest_name,
      serviceTitle: row.service
        ? serviceTitle(row.service, locale)
        : null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
    };
  });

  let todayCount = 0;
  let next7Count = 0;
  for (const appt of appointments) {
    const day = zonedDateIso(new Date(appt.startsAt), timezone);
    if (day === todayIso) todayCount += 1;
    if (day >= todayIso && day <= rangeEndIso) next7Count += 1;
  }

  const statusExpiries: StatusExpiryItem[] = (
    (peopleExpiryResult.data ?? []) as PersonRow[]
  )
    .map((raw) => {
      const row = decryptPersonRow(raw, key);
      if (!row.status_expires_at) return null;
      const expiresAt = row.status_expires_at.slice(0, 10);
      return {
        id: row.id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        expiresAt,
        days: daysUntilIso(expiresAt, now),
        href: `/people/${row.id}`,
      };
    })
    .filter((row): row is StatusExpiryItem => row != null && row.days <= 60)
    .slice(0, 5);

  const statusExpiring30 = statusExpiries.filter((row) => row.days <= 30).length;
  const peopleCount = peopleCountResult.count ?? 0;
  const needsSetup =
    !bookingEnabled || activeServices === 0 || !hasAvailability;

  return {
    hasCaseload:
      liveProjects.length > 0 || peopleCount > 0 || appointments.length > 0,
    kpis: {
      openProjects: openProjects.length,
      dueIn14Days,
      overdueSubmissions,
      docsToReview: uploadedResult.count ?? 0,
      stuckWaiting: liveProjects.filter(
        (project) => project.status === "stuck" || project.status === "waiting",
      ).length,
      peopleCount,
      statusExpiring30,
    },
    booking: {
      timezone,
      enabled: bookingEnabled,
      activeServices,
      hasAvailability,
      todayCount,
      next7Count,
      needsSetup,
    },
    projectsByStatus,
    peopleByVisa,
    submitTrend,
    upcoming,
    appointments,
    statusExpiries,
  };
}
