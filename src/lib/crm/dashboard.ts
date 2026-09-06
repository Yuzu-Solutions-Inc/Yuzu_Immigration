import type { ProjectStatus } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import {
  listProjects,
  requireOrganizationId,
  type ProjectRow,
} from "@/lib/crm/queries";
import { isTerminalStatus, PROJECT_STATUSES } from "@/lib/crm/statuses";
import {
  addDaysToIsoDate,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";
import type { BookingAppointmentRow } from "@/lib/booking/types";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { ensureBookingSettings } from "@/lib/booking/settings";
import { createClient } from "@/lib/supabase/server";
import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { daysUntilIso } from "@/lib/crm/dates";
import {
  getProjectsProgress,
  type ProjectProgress,
} from "@/lib/crm/progress";
import {
  EMPTY_STAFF_SETUP,
  getStaffSetupChecklist,
  type StaffSetupChecklist,
} from "@/lib/crm/setup-checklist";

export type ChartDatum = {
  key: string;
  count: number;
};

export const ATTENTION_KINDS = [
  "overdue",
  "docs_review",
  "questionnaire",
  "unpaid",
  "stuck",
  "due_soon",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export type AttentionAlert = {
  kind: AttentionKind;
  days?: number;
  count?: number;
  amountCents?: number;
  currency?: string;
};

export type AttentionRow = {
  id: string;
  title: string;
  href: string;
  status?: ProjectStatus;
  alerts: AttentionAlert[];
  docsDone?: number;
  docsTotal?: number;
  formPercent?: number;
};

export type DashboardAppointment = {
  id: string;
  guestName: string;
  serviceTitle: string | null;
  startsAt: string;
  endsAt: string;
  status: BookingAppointmentRow["status"];
  meetJoinUrl: string | null;
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
    readyToSubmit: number;
    submittedProjects: number;
    docsToReview: number;
    pendingPayments: number;
    pendingAmountCents: number;
    pendingCurrency: string;
    peopleCount: number;
  };
  booking: BookingModuleSummary;
  setup: StaffSetupChecklist;
  projectsByStatus: ChartDatum[];
  attention: AttentionRow[];
  appointments: DashboardAppointment[];
};

export const EMPTY_HOME_DASHBOARD: HomeDashboard = {
  hasCaseload: false,
  kpis: {
    openProjects: 0,
    readyToSubmit: 0,
    submittedProjects: 0,
    docsToReview: 0,
    pendingPayments: 0,
    pendingAmountCents: 0,
    pendingCurrency: "CAD",
    peopleCount: 0,
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
  setup: EMPTY_STAFF_SETUP,
  projectsByStatus: [],
  attention: [],
  appointments: [],
};

const ATTENTION_RANK: Record<AttentionKind, number> = {
  overdue: 0,
  docs_review: 1,
  questionnaire: 2,
  unpaid: 3,
  stuck: 4,
  due_soon: 5,
};

const ATTENTION_LIMIT = 40;

function isReadyToSubmit(stats: ProjectProgress) {
  if (stats.formPercent < 100 || stats.docsToReview > 0) return false;
  return stats.docsTotal === 0 || stats.docsDone >= stats.docsTotal;
}

function addAlert(row: AttentionRow, alert: AttentionAlert) {
  const existing = row.alerts.find((item) => item.kind === alert.kind);
  if (!existing) {
    row.alerts.push(alert);
    return;
  }
  if (alert.count != null) {
    existing.count = Math.max(existing.count ?? 0, alert.count);
  }
  if (alert.amountCents != null) {
    existing.amountCents = (existing.amountCents ?? 0) + alert.amountCents;
    existing.currency = alert.currency ?? existing.currency;
  }
  if (alert.days != null) {
    existing.days =
      existing.days == null ? alert.days : Math.min(existing.days, alert.days);
  }
}

function countBy<T extends string>(
  values: T[],
  order: readonly T[],
): ChartDatum[] {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return order
    .map((key) => ({ key, count: counts.get(key) ?? 0 }))
    .filter((row) => row.count > 0);
}

function emptyProgress(): ProjectProgress {
  return { docsDone: 0, docsTotal: 0, formPercent: 0, docsToReview: 0 };
}

function withProgress(
  project: ProjectRow,
  progress: Map<string, ProjectProgress>,
) {
  const stats = progress.get(project.id) ?? emptyProgress();
  return {
    status: project.status,
    docsDone: stats.docsDone,
    docsTotal: stats.docsTotal,
    formPercent: stats.formPercent,
  };
}

export async function getHomeDashboard(
  locale?: string | null,
): Promise<HomeDashboard> {
  const orgId = await requireOrganizationId();
  if (!orgId) return EMPTY_HOME_DASHBOARD;
  const user = await getSessionUser();
  if (!user) return EMPTY_HOME_DASHBOARD;

  const supabase = await createClient();
  const now = new Date();
  const key = await getOrgDataKey(orgId);

  const [
    projects,
    peopleCountResult,
    settingsResult,
    servicesResult,
    rulesResult,
    setup,
  ] = await Promise.all([
    listProjects(),
    supabase
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("booking_settings")
      .select("timezone, is_enabled")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("booking_services")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("booking_availability_rules")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("user_id", user.id),
    getStaffSetupChecklist(orgId),
  ]);

  if (peopleCountResult.error) {
    console.error("getHomeDashboard people:", peopleCountResult.error.message);
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

  const timezone =
    (settingsResult.data?.timezone as string | undefined) ?? "America/Toronto";
  const activeServices = servicesResult.count ?? 0;
  const hasAvailability = (rulesResult.count ?? 0) > 0;
  let bookingEnabled = Boolean(settingsResult.data?.is_enabled);
  if (!settingsResult.data && (activeServices > 0 || hasAvailability)) {
    const settings = await ensureBookingSettings(orgId, user.id, supabase);
    bookingEnabled = Boolean(settings?.is_enabled);
  }
  const todayIso = zonedDateIso(now, timezone);
  const rangeEndIso = addDaysToIsoDate(todayIso, 7);
  const appointmentsFrom = zonedCivilToUtc(todayIso, "00:00", timezone);
  const appointmentsTo = zonedCivilToUtc(
    addDaysToIsoDate(rangeEndIso, 1),
    "00:00",
    timezone,
  );

  const liveProjects = projects.filter((project) => !project.destroyed_at);
  const openProjects = liveProjects.filter(
    (project) => !isTerminalStatus(project.status),
  );
  const openIds = openProjects.map((project) => project.id);

  const [
    progress,
    uploadedResult,
    appointmentsResult,
    paymentsResult,
    answersResult,
    ungeneratedFormsResult,
    unpaidBookingsResult,
  ] = await Promise.all([
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
      .gte("starts_at", appointmentsFrom.toISOString())
      .lt("starts_at", appointmentsTo.toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(40),
    supabase
      .from("payment_requests")
      .select(
        "id, source, amount_cents, currency, description, project_id, appointment_id",
      )
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    openIds.length > 0
      ? supabase
          .from("project_form_answers")
          .select("project_id, questionnaire_submitted_at")
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .not("questionnaire_submitted_at", "is", null)
      : Promise.resolve({ data: [], error: null }),
    openIds.length > 0
      ? supabase
          .from("project_forms")
          .select("project_id")
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .eq("is_required", true)
          .in("status", ["todo", "in_progress", "ready"])
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("booking_appointments")
      .select(
        "*, service:booking_services(title, translations, price_cents, currency)",
      )
      .eq("organization_id", orgId)
      .eq("status", "pending_payment")
      .gte("starts_at", new Date(now.getTime() - 86_400_000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(12),
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
  if (paymentsResult.error) {
    console.error("getHomeDashboard payments:", paymentsResult.error.message);
  }
  if (answersResult.error) {
    console.error("getHomeDashboard answers:", answersResult.error.message);
  }
  if (ungeneratedFormsResult.error) {
    console.error(
      "getHomeDashboard forms:",
      ungeneratedFormsResult.error.message,
    );
  }
  if (unpaidBookingsResult.error) {
    console.error(
      "getHomeDashboard unpaid bookings:",
      unpaidBookingsResult.error.message,
    );
  }

  const projectsByStatus = countBy(
    liveProjects.map((project) => project.status),
    PROJECT_STATUSES,
  );

  const datedOpen = openProjects.filter(
    (project): project is ProjectRow & { submit_before: string } =>
      Boolean(project.submit_before),
  );

  const submittedIds = new Set(
    (
      (answersResult.data ?? []) as Array<{
        project_id: string;
        questionnaire_submitted_at: string | null;
      }>
    ).map((row) => row.project_id),
  );
  const ungeneratedIds = new Set(
    ((ungeneratedFormsResult.data ?? []) as Array<{ project_id: string }>).map(
      (row) => row.project_id,
    ),
  );

  const rows = new Map<string, AttentionRow>();
  const projectById = new Map(
    liveProjects.map((project) => [project.id, project]),
  );

  const touchProject = (project: ProjectRow): AttentionRow => {
    const id = `project:${project.id}`;
    const current = rows.get(id);
    if (current) return current;
    const row: AttentionRow = {
      id,
      title: project.title,
      href: `/projects/${project.id}`,
      alerts: [],
      ...withProgress(project, progress),
    };
    rows.set(id, row);
    return row;
  };

  for (const project of datedOpen) {
    const days = daysUntilIso(project.submit_before, now);
    if (days >= 0 && days > 14) continue;
    addAlert(touchProject(project), {
      kind: days < 0 ? "overdue" : "due_soon",
      days,
    });
  }

  for (const project of openProjects) {
    const stats = progress.get(project.id) ?? emptyProgress();
    if (stats.docsToReview > 0) {
      addAlert(touchProject(project), {
        kind: "docs_review",
        count: stats.docsToReview,
      });
    }
    if (submittedIds.has(project.id) && ungeneratedIds.has(project.id)) {
      addAlert(touchProject(project), { kind: "questionnaire" });
    }
    if (project.status === "stuck" || project.status === "waiting") {
      addAlert(touchProject(project), { kind: "stuck" });
    }
  }

  const paidAppointmentIds = new Set<string>();

  for (const row of (paymentsResult.data ?? []) as Array<{
    id: string;
    source: string;
    amount_cents: number;
    currency: string;
    description: string;
    project_id: string | null;
    appointment_id: string | null;
  }>) {
    if (row.appointment_id) paidAppointmentIds.add(row.appointment_id);
    const project = row.project_id ? projectById.get(row.project_id) : null;
    if (project) {
      addAlert(touchProject(project), {
        kind: "unpaid",
        amountCents: row.amount_cents,
        currency: row.currency,
      });
      continue;
    }
    rows.set(`unpaid:${row.id}`, {
      id: `unpaid:${row.id}`,
      title: row.description || "Payment",
      href: "/bookings",
      alerts: [
        {
          kind: "unpaid",
          amountCents: row.amount_cents,
          currency: row.currency,
        },
      ],
    });
  }

  type AppointmentJoin = BookingAppointmentRow & {
    service?: {
      title: string;
      translations?: unknown;
      price_cents?: number;
      currency?: string;
    } | null;
  };

  const mapAppointment = (row: AppointmentJoin): DashboardAppointment => {
    const guest = decryptBookingGuestRow(row, key);
    return {
      id: row.id,
      guestName: guest.guest_name,
      serviceTitle: row.service ? serviceTitle(row.service, locale) : null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      meetJoinUrl: row.meet_join_url,
    };
  };

  for (const row of (unpaidBookingsResult.data ?? []) as AppointmentJoin[]) {
    if (paidAppointmentIds.has(row.id)) continue;
    const mapped = mapAppointment(row);
    const project = row.project_id ? projectById.get(row.project_id) : null;
    if (project) {
      addAlert(touchProject(project), {
        kind: "unpaid",
        amountCents: row.service?.price_cents || undefined,
        currency: row.service?.currency,
      });
      continue;
    }
    rows.set(`unpaid-booking:${row.id}`, {
      id: `unpaid-booking:${row.id}`,
      title: mapped.guestName,
      href: "/bookings",
      alerts: [
        {
          kind: "unpaid",
          amountCents: row.service?.price_cents || undefined,
          currency: row.service?.currency,
        },
      ],
    });
  }

  const attention = [...rows.values()]
    .map((row) => ({
      ...row,
      href:
        row.alerts.length > 0 &&
        row.alerts.every((alert) => alert.kind === "docs_review") &&
        row.id.startsWith("project:")
          ? `/projects/review?project=${row.id.slice("project:".length)}`
          : row.href,
      alerts: [...row.alerts].sort(
        (a, b) => ATTENTION_RANK[a.kind] - ATTENTION_RANK[b.kind],
      ),
    }))
    .sort((a, b) => {
      const rankA = ATTENTION_RANK[a.alerts[0]?.kind ?? "due_soon"];
      const rankB = ATTENTION_RANK[b.alerts[0]?.kind ?? "due_soon"];
      if (rankA !== rankB) return rankA - rankB;
      const daysA = a.alerts.find((alert) => alert.days != null)?.days;
      const daysB = b.alerts.find((alert) => alert.days != null)?.days;
      if (daysA != null && daysB != null && daysA !== daysB) return daysA - daysB;
      return a.title.localeCompare(b.title);
    })
    .slice(0, ATTENTION_LIMIT);

  const appointments = ((appointmentsResult.data ?? []) as AppointmentJoin[]).map(
    mapAppointment,
  );

  let todayCount = 0;
  let next7Count = 0;
  for (const appt of appointments) {
    const day = zonedDateIso(new Date(appt.startsAt), timezone);
    if (day === todayIso) todayCount += 1;
    if (day >= todayIso && day <= rangeEndIso) next7Count += 1;
  }

  const peopleCount = peopleCountResult.count ?? 0;
  const unpaidAlerts = attention.flatMap((row) =>
    row.alerts.filter((alert) => alert.kind === "unpaid"),
  );
  const pendingPayments = unpaidAlerts.length;
  const pendingAmountCents = unpaidAlerts.reduce(
    (sum, alert) => sum + (alert.amountCents ?? 0),
    0,
  );
  const pendingCurrency =
    unpaidAlerts.find((alert) => alert.currency)?.currency ?? "CAD";

  const submittedProjects = liveProjects.filter(
    (project) => project.status === "submitted",
  ).length;
  let readyToSubmit = 0;
  let openInProgress = 0;
  for (const project of openProjects) {
    if (project.status === "submitted") continue;
    const stats = progress.get(project.id) ?? emptyProgress();
    if (isReadyToSubmit(stats)) readyToSubmit += 1;
    else openInProgress += 1;
  }
  const needsSetup = activeServices === 0 || !hasAvailability;

  return {
    hasCaseload:
      liveProjects.length > 0 || peopleCount > 0 || appointments.length > 0,
    kpis: {
      openProjects: openInProgress,
      readyToSubmit,
      submittedProjects,
      docsToReview: uploadedResult.count ?? 0,
      pendingPayments,
      pendingAmountCents,
      pendingCurrency,
      peopleCount,
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
    setup,
    projectsByStatus,
    attention,
    appointments,
  };
}
