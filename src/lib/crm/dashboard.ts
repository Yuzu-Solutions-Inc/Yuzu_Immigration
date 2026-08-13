import type { DocumentDocKey, ProjectStatus } from "@/db/schema";
import { daysUntilIso, isoDateOnly } from "@/lib/crm/dates";
import {
  listProjects,
  listUpcomingStatusExpiries,
  requireOrganizationId,
  type PersonRow,
  type ProjectRow,
} from "@/lib/crm/queries";
import { isTerminalStatus } from "@/lib/crm/statuses";
import {
  decryptDocumentRequestRow,
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { createClient } from "@/lib/supabase/server";

export type HomeActionKind =
  | "doc_review"
  | "stuck"
  | "waiting"
  | "submit_overdue"
  | "expiry_overdue"
  | "share_expiring";

export type HomeActionItem = {
  id: string;
  kind: HomeActionKind;
  href: string;
  title: string;
  personName: string | null;
  docKey: DocumentDocKey | null;
  customLabel: string | null;
  date: string | null;
  days: number | null;
  priority: number;
};

export type HomeDeadlineItem = {
  id: string;
  href: string;
  title: string;
  date: string;
  days: number;
};

export type HomeAwaitingItem = {
  projectId: string;
  title: string;
  outstanding: number;
  href: string;
};

export type HomeActiveFile = {
  project: ProjectRow;
  formsDone: number;
  formsTotal: number;
  docsDone: number;
  docsTotal: number;
};

export type HomeActivityItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  status: ProjectStatus;
  statusAt: string;
  createdAt: string;
};

export type HomeDashboard = {
  kpis: {
    openFiles: number;
    needsAttention: number;
    submitted: number;
    docsToReview: number;
    deadlinesSoon: number;
    expiriesSoon: number;
    awaitingClient: number;
  };
  hasCaseload: boolean;
  actions: HomeActionItem[];
  awaiting: HomeAwaitingItem[];
  deadlines: HomeDeadlineItem[];
  expiries: PersonRow[];
  activeFiles: HomeActiveFile[];
  activity: HomeActivityItem[];
};

const EMPTY: HomeDashboard = {
  kpis: {
    openFiles: 0,
    needsAttention: 0,
    submitted: 0,
    docsToReview: 0,
    deadlinesSoon: 0,
    expiriesSoon: 0,
    awaitingClient: 0,
  },
  hasCaseload: false,
  actions: [],
  awaiting: [],
  deadlines: [],
  expiries: [],
  activeFiles: [],
  activity: [],
};

type IdCountRow = { project_id: string; status?: string };
type UploadedDocRow = {
  id: string;
  project_id: string;
  person_id: string;
  doc_key: DocumentDocKey;
  custom_label: string | null;
  updated_at: string;
};
type ShareRow = { id: string; project_id: string; expires_at: string };
type HistoryRow = {
  id: string;
  project_id: string;
  status: ProjectStatus;
  status_at: string;
  created_at: string;
};

function actionPriority(item: Omit<HomeActionItem, "priority">): number {
  if (item.kind === "submit_overdue" || item.kind === "expiry_overdue") {
    return (item.days ?? 0) - 100;
  }
  if (item.kind === "doc_review") return 10;
  if (item.kind === "stuck") return 20;
  if (item.kind === "waiting") return 30;
  if (item.kind === "share_expiring") return 40 + (item.days ?? 0);
  return 80;
}

function withPriority(item: Omit<HomeActionItem, "priority">): HomeActionItem {
  return { ...item, priority: actionPriority(item) };
}

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const orgId = await requireOrganizationId();
  if (!orgId) return EMPTY;

  const supabase = await createClient();
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  const [
    projects,
    expiries,
    uploadedCountResult,
    uploadedResult,
    sharesResult,
    historyResult,
  ] = await Promise.all([
    listProjects(),
    listUpcomingStatusExpiries(20),
    supabase
      .from("project_document_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "uploaded"),
    supabase
      .from("project_document_requests")
      .select("id, project_id, person_id, doc_key, custom_label, updated_at")
      .eq("organization_id", orgId)
      .eq("status", "uploaded")
      .order("updated_at", { ascending: false })
      .limit(25),
    supabase
      .from("form_share_links")
      .select("id, project_id, expires_at")
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .lte("expires_at", in7)
      .order("expires_at", { ascending: true })
      .limit(10),
    supabase
      .from("project_status_history")
      .select("id, project_id, status, status_at, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const liveProjects = projects.filter((project) => !project.destroyed_at);
  const projectById = new Map(liveProjects.map((project) => [project.id, project]));
  const openProjects = liveProjects.filter(
    (project) => !isTerminalStatus(project.status),
  );
  const openIds = openProjects.map((project) => project.id);
  const activeProjects = openProjects.filter(
    (project) =>
      project.status === "new" ||
      project.status === "in_progress" ||
      project.status === "stuck" ||
      project.status === "waiting",
  );

  const openFiles = liveProjects.filter(
    (project) => project.status === "new" || project.status === "in_progress",
  ).length;
  const needsAttention = liveProjects.filter(
    (project) => project.status === "stuck" || project.status === "waiting",
  ).length;
  const submitted = liveProjects.filter(
    (project) => project.status === "submitted",
  ).length;

  const relevantExpiries = expiries.filter((person) => {
    if (!person.status_expires_at) return false;
    return daysUntilIso(person.status_expires_at, now) <= 90;
  });
  const expiriesSoon = relevantExpiries.filter((person) => {
    if (!person.status_expires_at) return false;
    return daysUntilIso(person.status_expires_at, now) <= 30;
  }).length;

  const deadlineProjects = openProjects.filter((project) => {
    if (!project.submit_before) return false;
    const days = daysUntilIso(project.submit_before, now);
    return days <= 45;
  });
  const deadlinesSoon = deadlineProjects.filter(
    (project) => daysUntilIso(project.submit_before!, now) <= 30,
  ).length;

  const [requestedResult, formsResult, docsProgressResult] = await Promise.all([
    openIds.length > 0
      ? supabase
          .from("project_document_requests")
          .select("project_id")
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .eq("status", "requested")
          .eq("is_required", true)
          .limit(1000)
      : Promise.resolve({ data: [] as IdCountRow[], error: null }),
    openIds.length > 0
      ? supabase
          .from("project_forms")
          .select("project_id, status")
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .eq("is_required", true)
          .limit(1000)
      : Promise.resolve({ data: [] as IdCountRow[], error: null }),
    openIds.length > 0
      ? supabase
          .from("project_document_requests")
          .select("project_id, status")
          .eq("organization_id", orgId)
          .in("project_id", openIds)
          .eq("is_required", true)
          .limit(1000)
      : Promise.resolve({ data: [] as IdCountRow[], error: null }),
  ]);

  if (uploadedCountResult.error) {
    console.error(
      "getHomeDashboard uploaded count:",
      uploadedCountResult.error.message,
    );
  }
  if (uploadedResult.error) {
    console.error("getHomeDashboard uploaded:", uploadedResult.error.message);
  }
  if (requestedResult.error) {
    console.error("getHomeDashboard requested:", requestedResult.error.message);
  }
  if (formsResult.error) {
    console.error("getHomeDashboard forms:", formsResult.error.message);
  }
  if (docsProgressResult.error) {
    console.error("getHomeDashboard docs:", docsProgressResult.error.message);
  }
  if (sharesResult.error) {
    console.error("getHomeDashboard shares:", sharesResult.error.message);
  }
  if (historyResult.error) {
    console.error("getHomeDashboard history:", historyResult.error.message);
  }

  const uploadedDocs = ((uploadedResult.data ?? []) as UploadedDocRow[]).map(
    (row) => decryptDocumentRequestRow(row),
  );
  const requestedRows = (requestedResult.data ?? []) as IdCountRow[];
  const formRows = (formsResult.data ?? []) as IdCountRow[];
  const docProgressRows = (docsProgressResult.data ?? []) as IdCountRow[];
  const shares = (sharesResult.data ?? []) as ShareRow[];
  const history = (historyResult.data ?? []) as HistoryRow[];

  const missingProjectIds = [
    ...new Set(
      [
        ...uploadedDocs.map((row) => row.project_id),
        ...shares.map((row) => row.project_id),
        ...history.map((row) => row.project_id),
      ].filter((id) => !projectById.has(id)),
    ),
  ];

  if (missingProjectIds.length > 0) {
    const { data, error } = await supabase
      .from("immigration_projects")
      .select("id, title")
      .eq("organization_id", orgId)
      .in("id", missingProjectIds);
    if (error) {
      console.error("getHomeDashboard project titles:", error.message);
    } else {
      for (const row of data ?? []) {
        projectById.set(row.id as string, {
          id: row.id as string,
          title: decryptProjectRow({ title: row.title as string }).title,
        } as ProjectRow);
      }
    }
  }

  const personIds = [...new Set(uploadedDocs.map((row) => row.person_id))];
  const personNameById = new Map<string, string>();
  if (personIds.length > 0) {
    const { data, error } = await supabase
      .from("people")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .in("id", personIds);
    if (error) {
      console.error("getHomeDashboard people:", error.message);
    } else {
      for (const row of data ?? []) {
        const person = decryptPersonRow(
          row as { id: string; first_name: string; last_name: string },
        );
        personNameById.set(
          person.id,
          `${person.first_name} ${person.last_name}`.trim(),
        );
      }
    }
  }

  const actions: HomeActionItem[] = [];

  for (const doc of uploadedDocs) {
    const project = projectById.get(doc.project_id);
    if (!project || project.destroyed_at) continue;
    actions.push(
      withPriority({
        id: `doc:${doc.id}`,
        kind: "doc_review",
        href: `/projects/${doc.project_id}#documents`,
        title: project.title,
        personName: personNameById.get(doc.person_id) ?? null,
        docKey: doc.doc_key,
        customLabel: doc.custom_label,
        date: doc.updated_at,
        days: null,
      }),
    );
  }

  for (const project of liveProjects) {
    if (project.status !== "stuck" && project.status !== "waiting") continue;
    actions.push(
      withPriority({
        id: `status:${project.id}`,
        kind: project.status,
        href: `/projects/${project.id}`,
        title: project.title,
        personName: null,
        docKey: null,
        customLabel: null,
        date: project.status_at,
        days: null,
      }),
    );
  }

  for (const project of deadlineProjects) {
    const days = daysUntilIso(project.submit_before!, now);
    if (days >= 0) continue;
    actions.push(
      withPriority({
        id: `submit:${project.id}`,
        kind: "submit_overdue",
        href: `/projects/${project.id}`,
        title: project.title,
        personName: null,
        docKey: null,
        customLabel: null,
        date: project.submit_before,
        days,
      }),
    );
  }

  for (const person of relevantExpiries) {
    const days = daysUntilIso(person.status_expires_at!, now);
    if (days >= 0) continue;
    actions.push(
      withPriority({
        id: `expiry:${person.id}`,
        kind: "expiry_overdue",
        href: `/people/${person.id}`,
        title: `${person.first_name} ${person.last_name}`.trim(),
        personName: null,
        docKey: null,
        customLabel: null,
        date: person.status_expires_at,
        days,
      }),
    );
  }

  for (const share of shares) {
    const project = projectById.get(share.project_id);
    if (!project || project.destroyed_at || isTerminalStatus(project.status)) {
      continue;
    }
    actions.push(
      withPriority({
        id: `share:${share.id}`,
        kind: "share_expiring",
        href: `/projects/${share.project_id}#forms`,
        title: project.title,
        personName: null,
        docKey: null,
        customLabel: null,
        date: isoDateOnly(share.expires_at),
        days: daysUntilIso(share.expires_at, now),
      }),
    );
  }

  actions.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  const outstandingByProject = new Map<string, number>();
  for (const row of requestedRows) {
    outstandingByProject.set(
      row.project_id,
      (outstandingByProject.get(row.project_id) ?? 0) + 1,
    );
  }

  const awaiting: HomeAwaitingItem[] = [...outstandingByProject.entries()]
    .map(([projectId, outstanding]) => {
      const project = projectById.get(projectId);
      if (!project) return null;
      return {
        projectId,
        title: project.title,
        outstanding,
        href: `/projects/${projectId}#documents`,
      };
    })
    .filter((row): row is HomeAwaitingItem => row !== null)
    .sort((a, b) => b.outstanding - a.outstanding || a.title.localeCompare(b.title))
    .slice(0, 8);

  const awaitingClient = [...outstandingByProject.values()].reduce(
    (sum, count) => sum + count,
    0,
  );

  const formStats = new Map<string, { done: number; total: number }>();
  for (const row of formRows) {
    const current = formStats.get(row.project_id) ?? { done: 0, total: 0 };
    current.total += 1;
    if (row.status === "ready" || row.status === "generated") current.done += 1;
    formStats.set(row.project_id, current);
  }

  const docStats = new Map<string, { done: number; total: number }>();
  for (const row of docProgressRows) {
    const current = docStats.get(row.project_id) ?? { done: 0, total: 0 };
    current.total += 1;
    if (row.status === "uploaded" || row.status === "accepted") current.done += 1;
    docStats.set(row.project_id, current);
  }

  const statusRank = (status: ProjectStatus) => {
    if (status === "stuck") return 0;
    if (status === "waiting") return 1;
    if (status === "in_progress") return 2;
    return 3;
  };

  const activeFiles: HomeActiveFile[] = [...activeProjects]
    .sort((a, b) => {
      const rank = statusRank(a.status) - statusRank(b.status);
      if (rank !== 0) return rank;
      if (a.submit_before && b.submit_before) {
        return a.submit_before.localeCompare(b.submit_before);
      }
      if (a.submit_before) return -1;
      if (b.submit_before) return 1;
      return b.opened_at.localeCompare(a.opened_at);
    })
    .slice(0, 6)
    .map((project) => ({
      project,
      formsDone: formStats.get(project.id)?.done ?? 0,
      formsTotal: formStats.get(project.id)?.total ?? 0,
      docsDone: docStats.get(project.id)?.done ?? 0,
      docsTotal: docStats.get(project.id)?.total ?? 0,
    }));

  const deadlines: HomeDeadlineItem[] = deadlineProjects
    .map((project) => ({
      id: project.id,
      href: `/projects/${project.id}`,
      title: project.title,
      date: project.submit_before!,
      days: daysUntilIso(project.submit_before!, now),
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  const activity: HomeActivityItem[] = history
    .map((row) => {
      const project = projectById.get(row.project_id);
      if (!project || project.destroyed_at) return null;
      return {
        id: row.id,
        projectId: row.project_id,
        projectTitle: project.title,
        status: row.status,
        statusAt: row.status_at,
        createdAt: row.created_at,
      };
    })
    .filter((row): row is HomeActivityItem => row !== null)
    .slice(0, 8);

  return {
    kpis: {
      openFiles,
      needsAttention,
      submitted,
      docsToReview: uploadedCountResult.count ?? uploadedDocs.length,
      deadlinesSoon,
      expiriesSoon,
      awaitingClient,
    },
    hasCaseload: liveProjects.length > 0 || relevantExpiries.length > 0,
    actions: actions.slice(0, 12),
    awaiting,
    deadlines,
    expiries: relevantExpiries.slice(0, 8),
    activeFiles,
    activity,
  };
}
