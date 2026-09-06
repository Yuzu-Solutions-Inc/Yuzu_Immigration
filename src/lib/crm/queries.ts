import { createClient } from "@/lib/supabase/server";
import { getPrimaryMembership } from "@/lib/auth/session";
import type { OrgRole } from "@/lib/auth/rbac";
import { mapAssignedRole } from "@/lib/auth/rbac";
import type {
  BookingAppointmentStatus,
  ParticipantRole,
  PersonImmigrationStatus,
  ProgramFamily,
  ProjectJurisdiction,
  ProjectStatus,
} from "@/db/schema";
import { serviceTitle } from "@/lib/booking/service-i18n";
import {
  decryptNoteBody,
  decryptPersonRow,
  decryptProjectNoteBody,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import {
  comparePersonSearchName,
  hashEmailLookup,
  looksLikeEmail,
  matchesSearchQuery,
} from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { sortByPrincipalFirst } from "@/lib/crm/programs";
import { addDaysIso } from "@/lib/crm/dates";
import { todayDateInputValue } from "@/lib/crm/statuses";
import {
  clampListLimit,
  clampListOffset,
  compareNullableIsoDates,
  docsListPercent,
  emptyListPage,
  fetchAllInChunks,
  listRange,
  sliceListPage,
  asListFilterQuery,
  type ListFilterQuery,
  type ListPage,
} from "@/lib/lists/pagination";

export type PersonRow = {
  id: string;
  organization_id: string;
  partner_id?: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_locale: string;
  immigration_status: PersonImmigrationStatus;
  status_expires_at: string | null;
  sage_contact_id?: string | null;
  sage_has_main_address?: boolean;
  sage_address_country?: string | null;
  sage_address_region?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonNoteRow = {
  id: string;
  organization_id: string;
  person_id: string;
  body: string;
  appointment_id: string | null;
  occurred_at: string | null;
  status: BookingAppointmentStatus | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
};

export type PersonMeetingItem = {
  key: string;
  noteId: string | null;
  appointmentId: string | null;
  source: "booking" | "manual";
  occurredAt: string;
  endsAt: string | null;
  status: BookingAppointmentStatus | null;
  serviceTitle: string | null;
  hostName: string | null;
  body: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};

const MANUAL_MEETING_STATUSES = [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "pending_payment",
] as const satisfies readonly BookingAppointmentStatus[];

function isMeetingStatus(value: string | null): value is BookingAppointmentStatus {
  return (
    value != null &&
    (MANUAL_MEETING_STATUSES as readonly string[]).includes(value)
  );
}

export type ProjectNoteRow = {
  id: string;
  organization_id: string;
  project_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
};

export type StaffProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type OrgMemberRow = {
  id: string;
  user_id: string;
  role: OrgRole;
  is_licensed: boolean;
  licensed_at_renewal: boolean | null;
  profile: StaffProfileRow;
};

export type ProjectRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: ProjectStatus;
  status_at: string;
  submit_before: string | null;
  jurisdiction: ProjectJurisdiction;
  program_family: ProgramFamily;
  organization_program_id: string | null;
  form_language: "en" | "fr";
  representative_user_id: string | null;
  inbound_local_part?: string | null;
  created_by: string | null;
  opened_at: string;
  closed_at: string | null;
  retain_until: string | null;
  destroyed_at: string | null;
  created_at: string;
  updated_at: string;
  representative?: StaffProfileRow | null;
  organization_program_name?: string | null;
};

export type ParticipantRow = {
  id: string;
  organization_id: string;
  project_id: string;
  person_id: string;
  role: ParticipantRole;
  left_at: string | null;
  created_at: string;
  person?: PersonRow;
};

export async function requireOrganizationId() {
  const membership = await getPrimaryMembership();
  if (!membership) {
    return null;
  }
  return membership.organization.id;
}

type OrgListTable = "people" | "immigration_projects";

async function fetchOrgRows<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: OrgListTable,
  orgId: string,
  columns: string,
  apply?: (query: ListFilterQuery) => ListFilterQuery,
): Promise<{ rows: T[]; error: string | null }> {
  return fetchAllInChunks<T>(async (from, to) => {
    let query = asListFilterQuery(
      supabase.from(table).select(columns).eq("organization_id", orgId),
    );
    if (apply) {
      query = apply(query);
    }
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, to);
    if (error) {
      return { rows: [], error: error.message };
    }
    return { rows: (data ?? []) as T[], error: null };
  });
}

export type PeopleListSortKey =
  | "name"
  | "email"
  | "immigration_status"
  | "status_expires_at"
  | "updated_at";
export type PeopleExpiryFilter = "all" | "expired" | "expiring_30" | "no_date";

export type PeopleListFilters = {
  nameQuery?: string;
  emailQuery?: string;
  status?: PersonImmigrationStatus | "all";
  expiry?: PeopleExpiryFilter;
  sortKey?: PeopleListSortKey;
  sortDir?: "asc" | "desc";
};

const PEOPLE_LIST_COLUMNS =
  "id, first_name, last_name, email, immigration_status, status_expires_at, created_at, updated_at";

function applyPeopleSqlFilters(
  query: ListFilterQuery,
  filters: PeopleListFilters,
) {
  const status = filters.status ?? "all";
  const expiry = filters.expiry ?? "all";
  const today = todayDateInputValue();
  if (status !== "all") {
    query = query.eq("immigration_status", status);
  }
  if (expiry === "no_date") {
    query = query.is("status_expires_at", null);
  } else if (expiry === "expired") {
    query = query
      .not("status_expires_at", "is", null)
      .lt("status_expires_at", today);
  } else if (expiry === "expiring_30") {
    query = query
      .gte("status_expires_at", today)
      .lte("status_expires_at", addDaysIso(30));
  }
  return query;
}

function peopleNeedsDecryptScan(filters: PeopleListFilters) {
  const nameQuery = filters.nameQuery?.trim() ?? "";
  const emailQuery = filters.emailQuery?.trim() ?? "";
  const sortKey = filters.sortKey ?? "updated_at";
  if (nameQuery) return true;
  if (emailQuery && !looksLikeEmail(emailQuery)) return true;
  return sortKey === "name" || sortKey === "email";
}

function sortPeopleRows(
  rows: PersonRow[],
  sortKey: PeopleListSortKey,
  sortDir: "asc" | "desc",
) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = comparePersonSearchName(a, b);
    } else if (sortKey === "email") {
      cmp = (a.email ?? "").localeCompare(b.email ?? "", undefined, {
        sensitivity: "base",
      });
    } else if (sortKey === "immigration_status") {
      cmp = a.immigration_status.localeCompare(b.immigration_status);
    } else if (sortKey === "status_expires_at") {
      cmp = compareNullableIsoDates(a.status_expires_at, b.status_expires_at);
    } else {
      cmp = compareNullableIsoDates(a.updated_at, b.updated_at);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

async function hydratePeopleByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  ids: string[],
  key: Buffer,
): Promise<PersonRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("organization_id", orgId)
    .in("id", ids);
  if (error) {
    console.error("hydratePeopleByIds:", error.message);
    return [];
  }
  const byId = new Map(
    ((data ?? []) as PersonRow[]).map((row) => [
      row.id,
      decryptPersonRow(row, key),
    ]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is PersonRow => Boolean(row));
}

export async function listPeoplePage(
  filters: PeopleListFilters = {},
  page: { offset?: number; limit?: number } = {},
): Promise<ListPage<PersonRow>> {
  const orgId = await requireOrganizationId();
  if (!orgId) return emptyListPage();

  const supabase = await createClient();
  const key = await getOrgDataKey(orgId);
  const offset = clampListOffset(page.offset);
  const limit = clampListLimit(page.limit);
  const nameQuery = filters.nameQuery?.trim() ?? "";
  const emailQuery = filters.emailQuery?.trim() ?? "";
  const sortKey = filters.sortKey ?? "updated_at";
  const sortDir = filters.sortDir ?? "desc";

  if (emailQuery && looksLikeEmail(emailQuery)) {
    const { data, error } = await supabase
      .from("people")
      .select("*")
      .eq("organization_id", orgId)
      .eq("email_lookup_hash", hashEmailLookup(orgId, emailQuery, key));
    if (error) {
      console.error("listPeoplePage email:", error.message);
      return emptyListPage();
    }
    const rows = sortPeopleRows(
      ((data ?? []) as PersonRow[])
        .map((row) => decryptPersonRow(row, key))
        .filter((person) =>
          nameQuery
            ? matchesSearchQuery(
                `${person.first_name} ${person.last_name}`,
                nameQuery,
              )
            : true,
        )
        .filter((person) => {
          if (
            filters.status &&
            filters.status !== "all" &&
            person.immigration_status !== filters.status
          ) {
            return false;
          }
          if (filters.expiry === "no_date") return !person.status_expires_at;
          if (filters.expiry === "expired") {
            return Boolean(
              person.status_expires_at &&
                person.status_expires_at < todayDateInputValue(),
            );
          }
          if (filters.expiry === "expiring_30") {
            if (!person.status_expires_at) return false;
            const expires = person.status_expires_at;
            const today = todayDateInputValue();
            return expires >= today && expires <= addDaysIso(30);
          }
          return true;
        }),
      sortKey,
      sortDir,
    );
    return sliceListPage(rows, offset, limit);
  }

  if (!peopleNeedsDecryptScan(filters)) {
    const { from, to } = listRange(offset, limit);
    let query = asListFilterQuery(
      supabase
        .from("people")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId),
    );
    query = applyPeopleSqlFilters(query, filters);
    if (sortKey === "immigration_status") {
      query = query.order("immigration_status", {
        ascending: sortDir === "asc",
      });
    } else if (sortKey === "status_expires_at") {
      query = query.order("status_expires_at", {
        ascending: sortDir === "asc",
        nullsFirst: false,
      });
    } else {
      query = query.order("updated_at", {
        ascending: sortDir === "asc",
      });
    }
    query = query.order("id", { ascending: sortDir === "asc" });
    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("listPeoplePage:", error.message);
      return emptyListPage();
    }
    return {
      items: ((data ?? []) as PersonRow[]).map((row) =>
        decryptPersonRow(row, key),
      ),
      total: count ?? 0,
    };
  }

  const { rows, error } = await fetchOrgRows<
    Pick<
      PersonRow,
      | "id"
      | "first_name"
      | "last_name"
      | "email"
      | "immigration_status"
      | "status_expires_at"
      | "created_at"
      | "updated_at"
    >
  >(supabase, "people", orgId, PEOPLE_LIST_COLUMNS, (query) =>
    applyPeopleSqlFilters(query, filters),
  );
  if (error) {
    console.error("listPeoplePage:", error);
    return emptyListPage();
  }

  const matched = sortPeopleRows(
    rows
      .map((row) => decryptPersonRow(row, key))
      .filter((person) =>
        nameQuery
          ? matchesSearchQuery(
              `${person.first_name} ${person.last_name}`,
              nameQuery,
            )
          : true,
      )
      .filter((person) =>
        emailQuery
          ? matchesSearchQuery(person.email ?? "", emailQuery)
          : true,
      ) as PersonRow[],
    sortKey,
    sortDir,
  );
  const pageIds = matched.slice(offset, offset + limit).map((row) => row.id);
  return {
    items: await hydratePeopleByIds(supabase, orgId, pageIds, key),
    total: matched.length,
  };
}

export async function listPeople(
  query?: string,
  options?: { limit?: number },
): Promise<PersonRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const key = await getOrgDataKey(orgId);
  const limit = options?.limit;
  const q = query?.trim() ?? "";

  if (q && looksLikeEmail(q)) {
    let queryBuilder = supabase
      .from("people")
      .select("*")
      .eq("organization_id", orgId)
      .eq("email_lookup_hash", hashEmailLookup(orgId, q, key));
    if (limit != null) queryBuilder = queryBuilder.limit(limit);
    const { data, error } = await queryBuilder;
    if (error) {
      console.error("listPeople:", error.message);
      return [];
    }
    return ((data ?? []) as PersonRow[])
      .map((row) => decryptPersonRow(row, key))
      .sort(comparePersonSearchName);
  }

  const { rows, error } = await fetchOrgRows<PersonRow>(
    supabase,
    "people",
    orgId,
    "*",
  );
  if (error) {
    console.error("listPeople:", error);
    return [];
  }

  return rows
    .map((row) => decryptPersonRow(row, key))
    .filter((person) =>
      q
        ? matchesSearchQuery(
            `${person.first_name} ${person.last_name}`,
            q,
          )
        : true,
    )
    .sort(comparePersonSearchName)
    .slice(0, limit);
}

export async function listUpcomingStatusExpiries(
  limit = 15,
): Promise<PersonRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("organization_id", orgId)
    .not("status_expires_at", "is", null)
    .neq("immigration_status", "none")
    .order("status_expires_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("listUpcomingStatusExpiries:", error.message);
    return [];
  }
  const key = await getOrgDataKey(orgId);
  return ((data ?? []) as PersonRow[]).map((row) => decryptPersonRow(row, key));
}

export async function getPerson(personId: string): Promise<PersonRow | null> {
  const orgId = await requireOrganizationId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", personId)
    .maybeSingle();

  if (error) {
    console.error("getPerson:", error.message);
    return null;
  }
  return data ? decryptPersonRow(data as PersonRow, await getOrgDataKey(orgId)) : null;
}

export async function getPersonByPartnerId(
  partnerId: string,
): Promise<PersonRow | null> {
  const orgId = await requireOrganizationId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("organization_id", orgId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (error) {
    console.error("getPersonByPartnerId:", error.message);
    return null;
  }
  return data
    ? decryptPersonRow(data as PersonRow, await getOrgDataKey(orgId))
    : null;
}

export async function listPersonNotes(
  personId: string,
): Promise<PersonNoteRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_notes")
    .select(
      "id, organization_id, person_id, body, appointment_id, occurred_at, status, created_by, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPersonNotes:", error.message);
    return [];
  }

  const rows = (data ?? []) as Omit<PersonNoteRow, "author_name">[];
  const key = await getOrgDataKey(orgId);
  const authorIds = [
    ...new Set(rows.map((row) => row.created_by).filter(Boolean)),
  ] as string[];

  let names = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);
    if (profileError) {
      console.error("listPersonNotes authors:", profileError.message);
    } else {
      names = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          (p.full_name as string | null) || (p.email as string | null),
        ]),
      );
    }
  }

  return rows.map((row) => ({
    ...row,
    body: decryptNoteBody(row.body, key),
    appointment_id: row.appointment_id ?? null,
    occurred_at: row.occurred_at ?? null,
    status: isMeetingStatus(row.status) ? row.status : null,
    author_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
}

function oneRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listPersonMeetings(
  personId: string,
  locale: string,
): Promise<PersonMeetingItem[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const [notes, appointmentsResult] = await Promise.all([
    listPersonNotes(personId),
    supabase
      .from("booking_appointments")
      .select(
        "id, starts_at, ends_at, status, host_user_id, created_at, updated_at, service:booking_services(title, translations)",
      )
      .eq("organization_id", orgId)
      .eq("person_id", personId)
      .order("starts_at", { ascending: false }),
  ]);

  if (appointmentsResult.error) {
    console.error("listPersonMeetings:", appointmentsResult.error.message);
  }

  type AppointmentJoin = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    host_user_id: string;
    created_at: string;
    updated_at: string;
    service:
      | { title: string | null; translations: unknown }
      | { title: string | null; translations: unknown }[]
      | null;
  };

  const appointments = (appointmentsResult.data ?? []) as AppointmentJoin[];
  const notesByAppointment = new Map(
    notes
      .filter((note) => note.appointment_id)
      .map((note) => [note.appointment_id as string, note]),
  );

  const hostIds = [
    ...new Set(appointments.map((row) => row.host_user_id).filter(Boolean)),
  ];
  let hostNames = new Map<string, string | null>();
  if (hostIds.length > 0) {
    const { data: profiles, error: hostError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", hostIds);
    if (hostError) {
      console.error("listPersonMeetings hosts:", hostError.message);
    } else {
      hostNames = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          (p.full_name as string | null) || (p.email as string | null),
        ]),
      );
    }
  }

  const items: PersonMeetingItem[] = [];

  for (const appointment of appointments) {
    const note = notesByAppointment.get(appointment.id) ?? null;
    const service = oneRelation(appointment.service);
    items.push({
      key: `appointment:${appointment.id}`,
      noteId: note?.id ?? null,
      appointmentId: appointment.id,
      source: "booking",
      occurredAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      status: isMeetingStatus(appointment.status) ? appointment.status : null,
      serviceTitle: service ? serviceTitle(service, locale) : null,
      hostName: hostNames.get(appointment.host_user_id) ?? null,
      body: note?.body ?? "",
      authorName: note?.author_name ?? null,
      createdAt: note?.created_at ?? appointment.created_at,
      updatedAt: note?.updated_at ?? appointment.updated_at,
    });
  }

  for (const note of notes) {
    if (note.appointment_id) continue;
    items.push({
      key: `note:${note.id}`,
      noteId: note.id,
      appointmentId: null,
      source: "manual",
      occurredAt: note.occurred_at ?? note.created_at,
      endsAt: null,
      status: note.status,
      serviceTitle: null,
      hostName: null,
      body: note.body,
      authorName: note.author_name,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  return items;
}

export async function listProjectNotes(
  projectId: string,
): Promise<ProjectNoteRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_notes")
    .select(
      "id, organization_id, project_id, body, created_by, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listProjectNotes:", error.message);
    return [];
  }

  const rows = (data ?? []) as Omit<ProjectNoteRow, "author_name">[];
  const key = await getOrgDataKey(orgId);
  const authorIds = [
    ...new Set(rows.map((row) => row.created_by).filter(Boolean)),
  ] as string[];

  let names = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);
    if (profileError) {
      console.error("listProjectNotes authors:", profileError.message);
    } else {
      names = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          (p.full_name as string | null) || (p.email as string | null),
        ]),
      );
    }
  }

  return rows.map((row) => ({
    ...row,
    body: decryptProjectNoteBody(row.body, key),
    author_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
}

export async function listOrgMembers(): Promise<OrgMemberRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, is_licensed, licensed_at_renewal")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listOrgMembers:", error.message);
    return [];
  }

  const userIds = (members ?? []).map((m) => m.user_id as string);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profileError) {
    console.error("listOrgMembers profiles:", profileError.message);
    return [];
  }

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as StaffProfileRow]),
  );

  return (members ?? [])
    .map((m) => {
      const profile = profileById.get(m.user_id as string);
      if (!profile) return null;
      return {
        id: m.id as string,
        user_id: m.user_id as string,
        role: mapAssignedRole(m.role),
        is_licensed: m.is_licensed !== false,
        licensed_at_renewal:
          typeof m.licensed_at_renewal === "boolean"
            ? m.licensed_at_renewal
            : null,
        profile,
      };
    })
    .filter((row): row is OrgMemberRow => row !== null)
    .sort((a, b) =>
      (a.profile.full_name || a.profile.email || "").localeCompare(
        b.profile.full_name || b.profile.email || "",
        undefined,
        { sensitivity: "base" },
      ),
    );
}

export type ProjectsListSortKey =
  | "title"
  | "program_family"
  | "created_at"
  | "updated_at"
  | "submit_before"
  | "representative"
  | "documents"
  | "forms";

export type ProjectsListFilters = {
  titleQuery?: string;
  program?: ProgramFamily | "all";
  status?: ProjectStatus | "all";
  representative?: string | "all" | "unassigned";
  sortKey?: ProjectsListSortKey;
  sortDir?: "asc" | "desc";
};

export type ProjectListProgress = {
  docsDone: number;
  docsTotal: number;
  docsToReview: number;
  formPercent: number;
};

export type ProjectsListPage = ListPage<ProjectRow> & {
  progressById: Record<string, ProjectListProgress>;
};

type ProjectListDbRow = ProjectRow & {
  docs_done?: number | null;
  docs_total?: number | null;
  docs_to_review?: number | null;
  form_percent?: number | null;
};

const PROJECT_LIST_SLIM_COLUMNS =
  "id, title, status, submit_before, jurisdiction, program_family, organization_program_id, representative_user_id, opened_at, created_at, updated_at, docs_done, docs_total, docs_to_review, form_percent";

function applyProjectsSqlFilters(
  query: ListFilterQuery,
  filters: ProjectsListFilters,
) {
  const program = filters.program ?? "all";
  const status = filters.status ?? "all";
  const representative = filters.representative ?? "all";
  if (program !== "all") {
    query = query.eq("program_family", program);
  }
  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (representative === "unassigned") {
    query = query.is("representative_user_id", null);
  } else if (representative !== "all") {
    query = query.eq("representative_user_id", representative);
  }
  return query;
}

function projectsNeedsDecryptScan(filters: ProjectsListFilters) {
  const titleQuery = filters.titleQuery?.trim() ?? "";
  const sortKey = filters.sortKey ?? "updated_at";
  if (titleQuery) return true;
  return (
    sortKey === "title" ||
    sortKey === "representative" ||
    sortKey === "documents"
  );
}

function progressFromProjectRow(row: ProjectListDbRow): ProjectListProgress {
  return {
    docsDone: row.docs_done ?? 0,
    docsTotal: row.docs_total ?? 0,
    docsToReview: row.docs_to_review ?? 0,
    formPercent: row.form_percent ?? 0,
  };
}

function progressMapForProjects(projects: ProjectListDbRow[]) {
  const progressById: Record<string, ProjectListProgress> = {};
  for (const project of projects) {
    progressById[project.id] = progressFromProjectRow(project);
  }
  return progressById;
}

async function withProjectListMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  projects: ProjectRow[],
): Promise<ProjectRow[]> {
  const repIds = [
    ...new Set(
      projects
        .map((p) => p.representative_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const programIds = [
    ...new Set(
      projects
        .map((p) => p.organization_program_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const profileById = new Map<string, StaffProfileRow>();
  if (repIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", repIds);

    if (profileError) {
      console.error("listProjects representatives:", profileError.message);
    } else {
      for (const p of profiles ?? []) {
        profileById.set(p.id as string, p as StaffProfileRow);
      }
    }
  }

  const programNameById = new Map<string, string>();
  if (programIds.length > 0) {
    const { data: programs } = await supabase
      .from("organization_programs")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("id", programIds);
    for (const row of programs ?? []) {
      programNameById.set(row.id as string, row.name as string);
    }
  }

  return projects.map((p) => ({
    ...p,
    representative: p.representative_user_id
      ? (profileById.get(p.representative_user_id) ?? null)
      : null,
    organization_program_name: p.organization_program_id
      ? (programNameById.get(p.organization_program_id) ?? null)
      : null,
  }));
}

function sortProjectRows(
  rows: ProjectListDbRow[],
  sortKey: ProjectsListSortKey,
  sortDir: "asc" | "desc",
) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "title") {
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    } else if (sortKey === "program_family") {
      cmp = a.program_family.localeCompare(b.program_family);
    } else if (sortKey === "created_at") {
      cmp = a.created_at.localeCompare(b.created_at);
    } else if (sortKey === "updated_at") {
      cmp = a.updated_at.localeCompare(b.updated_at);
    } else if (sortKey === "representative") {
      const aLabel =
        a.representative?.full_name || a.representative?.email || "";
      const bLabel =
        b.representative?.full_name || b.representative?.email || "";
      cmp = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
    } else if (sortKey === "documents") {
      cmp =
        docsListPercent(a.docs_done ?? 0, a.docs_total ?? 0) -
        docsListPercent(b.docs_done ?? 0, b.docs_total ?? 0);
    } else if (sortKey === "forms") {
      cmp = (a.form_percent ?? 0) - (b.form_percent ?? 0);
    } else {
      cmp = compareNullableIsoDates(a.submit_before, b.submit_before);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

async function hydrateProjectsByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  ids: string[],
  key: Buffer,
): Promise<ProjectListDbRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("immigration_projects")
    .select("*")
    .eq("organization_id", orgId)
    .in("id", ids);
  if (error) {
    console.error("hydrateProjectsByIds:", error.message);
    return [];
  }
  const byId = new Map(
    ((data ?? []) as ProjectListDbRow[]).map((row) => [
      row.id,
      decryptProjectRow(row, key),
    ]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is ProjectListDbRow => Boolean(row));
}

export async function listProjectsPage(
  filters: ProjectsListFilters = {},
  page: { offset?: number; limit?: number } = {},
): Promise<ProjectsListPage> {
  const orgId = await requireOrganizationId();
  if (!orgId) return { ...emptyListPage(), progressById: {} };

  const supabase = await createClient();
  const key = await getOrgDataKey(orgId);
  const offset = clampListOffset(page.offset);
  const limit = clampListLimit(page.limit);
  const titleQuery = filters.titleQuery?.trim() ?? "";
  const sortKey = filters.sortKey ?? "updated_at";
  const sortDir = filters.sortDir ?? "desc";

  if (!projectsNeedsDecryptScan(filters)) {
    const { from, to } = listRange(offset, limit);
    let query = asListFilterQuery(
      supabase
        .from("immigration_projects")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId),
    );
    query = applyProjectsSqlFilters(query, filters);
    if (sortKey === "program_family") {
      query = query.order("program_family", { ascending: sortDir === "asc" });
    } else if (sortKey === "submit_before") {
      query = query.order("submit_before", {
        ascending: sortDir === "asc",
        nullsFirst: false,
      });
    } else if (sortKey === "forms") {
      query = query.order("form_percent", { ascending: sortDir === "asc" });
    } else if (sortKey === "created_at") {
      query = query.order("created_at", { ascending: sortDir === "asc" });
    } else {
      query = query.order("updated_at", { ascending: sortDir === "asc" });
    }
    query = query.order("id", { ascending: sortDir === "asc" });
    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("listProjectsPage:", error.message);
      return { ...emptyListPage(), progressById: {} };
    }
    const decrypted = ((data ?? []) as ProjectListDbRow[]).map((row) =>
      decryptProjectRow(row, key),
    );
    const items = await withProjectListMeta(supabase, orgId, decrypted);
    return {
      items,
      total: count ?? 0,
      progressById: progressMapForProjects(decrypted),
    };
  }

  const { rows, error } = await fetchOrgRows<ProjectListDbRow>(
    supabase,
    "immigration_projects",
    orgId,
    PROJECT_LIST_SLIM_COLUMNS,
    (query) => applyProjectsSqlFilters(query, filters),
  );
  if (error) {
    console.error("listProjectsPage:", error);
    return { ...emptyListPage(), progressById: {} };
  }

  const decrypted = rows.map((row) => decryptProjectRow(row, key));
  const filtered = decrypted.filter((project) =>
    titleQuery ? matchesSearchQuery(project.title, titleQuery) : true,
  );
  const sortable =
    sortKey === "representative"
      ? ((await withProjectListMeta(supabase, orgId, filtered)) as ProjectListDbRow[])
      : filtered;
  const matched = sortProjectRows(sortable, sortKey, sortDir);
  const pageIds = matched.slice(offset, offset + limit).map((row) => row.id);
  const hydrated = await hydrateProjectsByIds(supabase, orgId, pageIds, key);
  const items = await withProjectListMeta(supabase, orgId, hydrated);
  return {
    items,
    total: matched.length,
    progressById: progressMapForProjects(hydrated),
  };
}

export async function listProjects(): Promise<ProjectRow[]> {
  const page = await listProjectsPage(
    { sortKey: "updated_at", sortDir: "desc" },
    { offset: 0, limit: 100 },
  );
  return page.items;
}

export async function searchProjects(
  query: string,
  limit = 8,
): Promise<Pick<ProjectRow, "id" | "title" | "status" | "organization_program_name">[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];
  const q = query.trim();
  if (!q) return [];

  const supabase = await createClient();
  const { rows, error } = await fetchOrgRows<{
    id: string;
    title: string;
    status: ProjectStatus;
    opened_at: string;
  }>(supabase, "immigration_projects", orgId, "id, title, status, opened_at");
  if (error) {
    console.error("searchProjects:", error);
    return [];
  }

  const key = await getOrgDataKey(orgId);
  return rows
    .map((row) => ({
      ...decryptProjectRow(row, key),
      opened_at: row.opened_at,
    }))
    .filter((project) => matchesSearchQuery(project.title, q))
    .sort((a, b) => {
      const byOpened = b.opened_at.localeCompare(a.opened_at);
      if (byOpened !== 0) return byOpened;
      return b.id.localeCompare(a.id);
    })
    .slice(0, limit)
    .map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      organization_program_name: null,
    }));
}

export async function getProject(projectId: string): Promise<ProjectRow | null> {
  const orgId = await requireOrganizationId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("immigration_projects")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("getProject:", error.message);
    return null;
  }
  if (!data) return null;

  const project = decryptProjectRow(
    data as ProjectRow,
    await getOrgDataKey(orgId),
  );

  let organizationProgramName: string | null = null;
  if (project.organization_program_id) {
    const { data: program } = await supabase
      .from("organization_programs")
      .select("name")
      .eq("organization_id", orgId)
      .eq("id", project.organization_program_id)
      .maybeSingle();
    organizationProgramName = (program?.name as string | undefined) ?? null;
  }

  if (!project.representative_user_id) {
    return {
      ...project,
      representative: null,
      organization_program_name: organizationProgramName,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", project.representative_user_id)
    .maybeSingle();

  return {
    ...project,
    representative: (profile as StaffProfileRow | null) ?? null,
    organization_program_name: organizationProgramName,
  };
}

export type ProjectStatusHistoryRow = {
  id: string;
  organization_id: string;
  project_id: string;
  status: ProjectStatus;
  status_at: string;
  changed_by: string | null;
  created_at: string;
};

export async function getProjectStatusHistory(
  projectId: string,
): Promise<ProjectStatusHistoryRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_status_history")
    .select("*")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("status_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getProjectStatusHistory:", error.message);
    return [];
  }
  return (data ?? []) as ProjectStatusHistoryRow[];
}

export async function getProjectParticipants(
  projectId: string,
): Promise<ParticipantRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data: participants, error } = await supabase
    .from("project_participants")
    .select("*")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .is("left_at", null)
    .order("created_at", { ascending: true });

  if (error || !participants?.length) {
    if (error) console.error("getProjectParticipants:", error.message);
    return [];
  }

  const personIds = participants.map((p) => p.person_id as string);
  const { data: peopleRows, error: peopleError } = await supabase
    .from("people")
    .select("*")
    .in("id", personIds);

  if (peopleError) {
    console.error("getProjectParticipants people:", peopleError.message);
    return participants as ParticipantRow[];
  }

  const key = await getOrgDataKey(orgId);
  const byId = new Map(
    (peopleRows ?? []).map((person) => [
      person.id as string,
      decryptPersonRow(person as PersonRow, key),
    ]),
  );

  return sortByPrincipalFirst(
    participants.map((row) => ({
      ...(row as ParticipantRow),
      person: byId.get(row.person_id as string),
    })),
  );
}

export async function getPersonProjects(personId: string): Promise<
  Array<ProjectRow & { role: ParticipantRole }>
> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("project_participants")
    .select("project_id, role, left_at")
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  if (error || !links?.length) {
    if (error) console.error("getPersonProjects:", error.message);
    return [];
  }

  const projectIds = links.map((l) => l.project_id as string);
  const { data: projects, error: projectsError } = await supabase
    .from("immigration_projects")
    .select("*")
    .in("id", projectIds);

  if (projectsError) {
    console.error("getPersonProjects projects:", projectsError.message);
    return [];
  }

  const key = await getOrgDataKey(orgId);
  const byId = new Map(
    (projects ?? []).map((p) => [
      p.id as string,
      decryptProjectRow(p as ProjectRow, key),
    ]),
  );

  return links
    .map((link) => {
      const project = byId.get(link.project_id as string);
      if (!project) return null;
      return {
        ...project,
        role: link.role as ParticipantRole,
      };
    })
    .filter((row): row is ProjectRow & { role: ParticipantRole } => row !== null);
}

export type PendingInvitationRow = {
  id: string;
  email: string;
  role: OrgRole;
  is_licensed: boolean;
  expires_at: string;
  created_at: string;
};

export async function listPendingInvitations(): Promise<PendingInvitationRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, is_licensed, expires_at, created_at")
    .eq("organization_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPendingInvitations:", error.message);
    return [];
  }

  return ((data ?? []) as PendingInvitationRow[]).map((row) => ({
    ...row,
    role: mapAssignedRole(row.role),
  }));
}
