import { createClient } from "@/lib/supabase/server";
import { getPrimaryMembership } from "@/lib/auth/session";
import type {
  ParticipantRole,
  PersonImmigrationStatus,
  ProgramFamily,
  ProjectJurisdiction,
  ProjectStatus,
} from "@/db/schema";

export type PersonRow = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_locale: string;
  immigration_status: PersonImmigrationStatus;
  status_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonNoteRow = {
  id: string;
  organization_id: string;
  person_id: string;
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
  role: "owner" | "admin" | "member";
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
  form_language: "en" | "fr";
  representative_user_id: string | null;
  opened_at: string;
  closed_at: string | null;
  retain_until: string | null;
  destroyed_at: string | null;
  created_at: string;
  updated_at: string;
  representative?: StaffProfileRow | null;
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

export async function listPeople(query?: string): Promise<PersonRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  let request = supabase
    .from("people")
    .select("*")
    .eq("organization_id", orgId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(100);

  const q = query?.trim();
  if (q) {
    request = request.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }

  const { data, error } = await request;
  if (error) {
    console.error("listPeople:", error.message);
    return [];
  }
  return (data ?? []) as PersonRow[];
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
  return (data ?? []) as PersonRow[];
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
  return data as PersonRow | null;
}

export async function listPersonNotes(
  personId: string,
): Promise<PersonNoteRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_notes")
    .select("id, organization_id, person_id, body, created_by, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listPersonNotes:", error.message);
    return [];
  }

  const rows = (data ?? []) as Omit<PersonNoteRow, "author_name">[];
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
    author_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
}

export async function listOrgMembers(): Promise<OrgMemberRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role")
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
        role: m.role as OrgMemberRow["role"],
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

export async function listProjects(): Promise<ProjectRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("immigration_projects")
    .select("*")
    .eq("organization_id", orgId)
    .order("opened_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("listProjects:", error.message);
    return [];
  }

  const projects = (data ?? []) as ProjectRow[];
  const repIds = [
    ...new Set(
      projects
        .map((p) => p.representative_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (repIds.length === 0) {
    return projects.map((p) => ({ ...p, representative: null }));
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", repIds);

  if (profileError) {
    console.error("listProjects representatives:", profileError.message);
    return projects.map((p) => ({ ...p, representative: null }));
  }

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as StaffProfileRow]),
  );

  return projects.map((p) => ({
    ...p,
    representative: p.representative_user_id
      ? (profileById.get(p.representative_user_id) ?? null)
      : null,
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

  const project = data as ProjectRow;
  if (!project.representative_user_id) {
    return { ...project, representative: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", project.representative_user_id)
    .maybeSingle();

  return {
    ...project,
    representative: (profile as StaffProfileRow | null) ?? null,
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

  const byId = new Map(
    (peopleRows ?? []).map((person) => [person.id as string, person as PersonRow]),
  );

  return participants.map((row) => ({
    ...(row as ParticipantRow),
    person: byId.get(row.person_id as string),
  }));
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

  const byId = new Map(
    (projects ?? []).map((p) => [p.id as string, p as ProjectRow]),
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
