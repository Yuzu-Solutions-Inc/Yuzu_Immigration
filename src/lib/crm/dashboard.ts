import type { PersonImmigrationStatus, ProjectStatus } from "@/db/schema";
import {
  listProjects,
  requireOrganizationId,
  type PersonRow,
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
import { createClient } from "@/lib/supabase/server";
import {
  decryptBookingGuestRow,
  decryptPersonRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { daysUntilIso } from "@/lib/crm/dates";
import {
  getProjectsProgress,
  type ProjectProgress,
} from "@/lib/crm/progress";

export type ChartDatum = {
  key: string;
  count: number;
};

export type AttentionKind =
  | "overdue"
  | "docs_review"
  | "questionnaire"
  | "unpaid"
  | "stuck"
  | "due_soon";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  href: string;
  status?: ProjectStatus;
  days?: number;
  count?: number;
  amountCents?: number;
  currency?: string;
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
};

export type StatusExpiryItem = {
  id: string;
  name: string;
  immigrationStatus: PersonImmigrationStatus;
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
    formsReady: number;
    stuckWaiting: number;
    pendingPayments: number;
    pendingAmountCents: number;
    pendingCurrency: string;
    peopleCount: number;
    statusExpiring30: number;
  };
  booking: BookingModuleSummary;
  projectsByStatus: ChartDatum[];
  attention: AttentionItem[];
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
    formsReady: 0,
    stuckWaiting: 0,
    pendingPayments: 0,
    pendingAmountCents: 0,
    pendingCurrency: "CAD",
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
  attention: [],
  appointments: [],
  statusExpiries: [],
};

const ATTENTION_RANK: Record<AttentionKind, number> = {
  overdue: 0,
  docs_review: 1,
  questionnaire: 2,
  unpaid: 3,
  stuck: 4,
  due_soon: 5,
};

const ATTENTION_LIMIT = 8;

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
  if (!orgId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();
  const key = await getOrgDataKey(orgId);

  const [
    projects,
    peopleCountResult,
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

  let dueIn14Days = 0;
  let overdueSubmissions = 0;
  for (const project of datedOpen) {
    const days = daysUntilIso(project.submit_before, now);
    if (days < 0) overdueSubmissions += 1;
    else if (days <= 14) dueIn14Days += 1;
  }

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

  const projectAttention = new Map<string, AttentionItem>();

  const upsertProjectAttention = (projectId: string, item: AttentionItem) => {
    const current = projectAttention.get(projectId);
    if (!current) {
      projectAttention.set(projectId, item);
      return;
    }
    if (ATTENTION_RANK[item.kind] < ATTENTION_RANK[current.kind]) {
      projectAttention.set(projectId, {
        ...item,
        count: item.count ?? current.count,
      });
      return;
    }
    if (item.count && !current.count) current.count = item.count;
  };

  for (const project of datedOpen) {
    const days = daysUntilIso(project.submit_before, now);
    if (days >= 0 && days > 14) continue;
    const kind = days < 0 ? "overdue" : "due_soon";
    const stats = progress.get(project.id) ?? emptyProgress();
    upsertProjectAttention(project.id, {
      id: `${kind}:${project.id}`,
      kind,
      title: project.title,
      href: `/projects/${project.id}`,
      days,
      count: stats.docsToReview || undefined,
      ...withProgress(project, progress),
    });
  }

  for (const project of openProjects) {
    const stats = progress.get(project.id) ?? emptyProgress();
    if (stats.docsToReview > 0) {
      upsertProjectAttention(project.id, {
        id: `docs_review:${project.id}`,
        kind: "docs_review",
        title: project.title,
        href: `/projects/${project.id}#documents`,
        count: stats.docsToReview,
        ...withProgress(project, progress),
      });
    }
    if (submittedIds.has(project.id) && ungeneratedIds.has(project.id)) {
      upsertProjectAttention(project.id, {
        id: `questionnaire:${project.id}`,
        kind: "questionnaire",
        title: project.title,
        href: `/projects/${project.id}#forms`,
        ...withProgress(project, progress),
      });
    }
    if (project.status === "stuck" || project.status === "waiting") {
      upsertProjectAttention(project.id, {
        id: `stuck:${project.id}`,
        kind: "stuck",
        title: project.title,
        href: `/projects/${project.id}`,
        ...withProgress(project, progress),
      });
    }
  }

  const attention: AttentionItem[] = [...projectAttention.values()];

  const projectTitleById = new Map(
    liveProjects.map((project) => [project.id, project.title]),
  );
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
    const projectTitle = row.project_id
      ? projectTitleById.get(row.project_id)
      : null;
    attention.push({
      id: `unpaid:${row.id}`,
      kind: "unpaid",
      title: row.description || projectTitle || "Payment",
      href: row.project_id
        ? `/projects/${row.project_id}#payments`
        : "/bookings",
      amountCents: row.amount_cents,
      currency: row.currency,
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
    };
  };

  for (const row of (unpaidBookingsResult.data ?? []) as AppointmentJoin[]) {
    if (paidAppointmentIds.has(row.id)) continue;
    const mapped = mapAppointment(row);
    attention.push({
      id: `unpaid-booking:${row.id}`,
      kind: "unpaid",
      title: mapped.guestName,
      href: "/bookings",
      amountCents: row.service?.price_cents || undefined,
      currency: row.service?.currency,
    });
  }

  attention.sort((a, b) => {
    const rank = ATTENTION_RANK[a.kind] - ATTENTION_RANK[b.kind];
    if (rank !== 0) return rank;
    if (a.kind === "overdue" || a.kind === "due_soon") {
      return (a.days ?? 0) - (b.days ?? 0);
    }
    if (a.kind === "docs_review") {
      return (b.count ?? 0) - (a.count ?? 0);
    }
    return a.title.localeCompare(b.title);
  });

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
        immigrationStatus: row.immigration_status,
        expiresAt,
        days: daysUntilIso(expiresAt, now),
        href: `/people/${row.id}`,
      };
    })
    .filter((row): row is StatusExpiryItem => row != null && row.days <= 60)
    .slice(0, 5);

  const statusExpiring30 = statusExpiries.filter((row) => row.days <= 30).length;
  const peopleCount = peopleCountResult.count ?? 0;
  const unpaidItems = attention.filter((item) => item.kind === "unpaid");
  const pendingPayments = unpaidItems.length;
  const pendingAmountCents = unpaidItems.reduce(
    (sum, item) => sum + (item.amountCents ?? 0),
    0,
  );
  const pendingCurrency =
    unpaidItems.find((item) => item.currency)?.currency ?? "CAD";
  let formsReady = 0;
  for (const projectId of submittedIds) {
    if (ungeneratedIds.has(projectId)) formsReady += 1;
  }
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
      formsReady,
      stuckWaiting: liveProjects.filter(
        (project) => project.status === "stuck" || project.status === "waiting",
      ).length,
      pendingPayments,
      pendingAmountCents,
      pendingCurrency,
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
    attention: attention.slice(0, ATTENTION_LIMIT),
    appointments,
    statusExpiries,
  };
}
