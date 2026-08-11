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

export type ProjectRow = {
  id: string;
  organization_id: string;
  title: string;
  status: ProjectStatus;
  status_at: string;
  jurisdiction: ProjectJurisdiction;
  program_family: ProgramFamily;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
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
  return (data ?? []) as ProjectRow[];
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
  return data as ProjectRow | null;
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
