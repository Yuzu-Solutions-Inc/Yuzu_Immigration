"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ParticipantRole, ProgramFamily, ProjectStatus } from "@/db/schema";
import {
  PROGRAM_FAMILIES,
  buildProjectTitle,
  defaultJurisdictionForProgram,
  type ProjectComposition,
} from "@/lib/crm/programs";
import { requireOrganizationId } from "@/lib/crm/queries";
import {
  recordProjectStatusHistory,
  statusChanged,
} from "@/lib/crm/status-history";
import { isTerminalStatus } from "@/lib/crm/statuses";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

const participantInputSchema = z.object({
  personId: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  immigrationStatus: z
    .enum([
      "none",
      "visitor",
      "student",
      "worker",
      "maintained",
      "permanent_resident",
      "canadian_citizen",
      "refugee_claimant",
      "protected_person",
      "overstay",
      "other",
    ])
    .optional(),
  statusExpiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  role: z.enum([
    "principal",
    "spouse",
    "partner",
    "dependent",
    "sponsor",
    "accompanying",
  ]),
});

const statusSchema = z.enum([
  "new",
  "in_progress",
  "stuck",
  "waiting",
  "submitted",
  "granted",
  "rejected",
]);

const projectFieldsSchema = z.object({
  locale: z.enum(["en", "fr"]).default("en"),
  composition: z.enum(["individual", "couple", "family"]),
  programFamily: z.enum(PROGRAM_FAMILIES as [ProgramFamily, ...ProgramFamily[]]),
  jurisdiction: z.enum(["federal", "quebec", "both"]).optional(),
  title: z.string().trim().max(200).optional(),
  status: statusSchema.optional(),
  statusAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  submitBefore: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  participants: z.array(participantInputSchema).min(1),
});

export type ProjectActionState = {
  error?: string;
};

/** @deprecated Prefer ProjectActionState */
export type CreateProjectState = ProjectActionState;

function programLabel(family: ProgramFamily, locale: "en" | "fr") {
  const labels: Record<ProgramFamily, { en: string; fr: string }> = {
    study_permit: { en: "Study permit", fr: "Permis d’études" },
    work_permit: { en: "Work permit", fr: "Permis de travail" },
    visitor: { en: "Visitor / TRV", fr: "Visiteur / VRT" },
    pgwp: { en: "PGWP", fr: "PTPD" },
    express_entry: { en: "Express Entry", fr: "Entrée express" },
    pnp: { en: "PNP", fr: "PCP" },
    family_sponsorship: { en: "Family sponsorship", fr: "Parrainage familial" },
    humanitarian: { en: "Humanitarian", fr: "Humanitaire" },
    quebec_pstq: { en: "Quebec PSTQ", fr: "PSTQ Québec" },
    quebec_family: { en: "Quebec family", fr: "Réunification Québec" },
    quebec_temporary: { en: "Quebec temporary", fr: "Temporaire Québec" },
    other: { en: "Other", fr: "Autre" },
  };
  return labels[family][locale];
}

function parseProjectForm(formData: FormData) {
  const locale = (formData.get("locale") as "en" | "fr") || "en";
  const composition = formData.get("composition") as ProjectComposition;
  const programFamily = formData.get("programFamily") as ProgramFamily;
  const jurisdictionRaw = String(formData.get("jurisdiction") || "");
  const titleRaw = String(formData.get("title") || "").trim();
  const statusRaw = String(formData.get("status") || "").trim();
  const statusAtRaw = String(formData.get("statusAt") || "").trim();
  const submitBeforeRaw = String(formData.get("submitBefore") || "").trim();

  const participantsJson = String(formData.get("participants") || "[]");
  let participantsParsed: unknown;
  try {
    participantsParsed = JSON.parse(participantsJson);
  } catch {
    return { error: "invalid" as const };
  }

  const parsed = projectFieldsSchema.safeParse({
    locale,
    composition,
    programFamily,
    jurisdiction: jurisdictionRaw || undefined,
    title: titleRaw || undefined,
    status: statusRaw || undefined,
    statusAt: statusAtRaw || undefined,
    submitBefore: submitBeforeRaw || undefined,
    participants: participantsParsed,
  });

  if (!parsed.success) {
    return { error: "invalid" as const };
  }

  return { data: parsed.data };
}

async function resolveParticipants(
  orgId: string,
  locale: "en" | "fr",
  participants: z.infer<typeof participantInputSchema>[],
): Promise<
  | { error: string }
  | {
      people: Array<{
        id: string;
        role: ParticipantRole;
        displayName: string;
      }>;
    }
> {
  const supabase = await createClient();
  const resolvedPeople: Array<{
    id: string;
    role: ParticipantRole;
    displayName: string;
  }> = [];
  const seen = new Set<string>();

  for (const participant of participants) {
    if (participant.personId) {
      const { data: existing, error } = await supabase
        .from("people")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .eq("id", participant.personId)
        .maybeSingle();

      if (error || !existing) {
        return { error: "person_missing" };
      }

      if (seen.has(existing.id as string)) {
        return { error: "invalid" };
      }
      seen.add(existing.id as string);

      resolvedPeople.push({
        id: existing.id as string,
        role: participant.role,
        displayName: `${existing.first_name} ${existing.last_name}`.trim(),
      });
      continue;
    }

    if (!participant.firstName || !participant.lastName) {
      return { error: "invalid" };
    }

    const immigrationStatus = participant.immigrationStatus ?? "none";
    const statusExpiresAt =
      immigrationStatus === "none" || !participant.statusExpiresAt
        ? null
        : participant.statusExpiresAt;

    const { data: created, error: createError } = await supabase
      .from("people")
      .insert({
        organization_id: orgId,
        first_name: participant.firstName,
        last_name: participant.lastName,
        email: participant.email || null,
        preferred_locale: locale,
        immigration_status: immigrationStatus,
        status_expires_at: statusExpiresAt,
      })
      .select("id, first_name, last_name")
      .single();

    if (createError || !created) {
      console.error("create person:", createError?.message);
      return { error: "create_failed" };
    }

    seen.add(created.id as string);
    resolvedPeople.push({
      id: created.id as string,
      role: participant.role,
      displayName: `${created.first_name} ${created.last_name}`.trim(),
    });
  }

  if (!resolvedPeople.some((p) => p.role === "principal")) {
    return { error: "principal_required" };
  }

  return { people: resolvedPeople };
}

export async function createProjectAction(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = parseProjectForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { data } = parsed;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const jurisdiction =
    data.jurisdiction ?? defaultJurisdictionForProgram(data.programFamily);

  const resolved = await resolveParticipants(
    orgId,
    data.locale,
    data.participants,
  );
  if ("error" in resolved) return { error: resolved.error };

  const title =
    data.title ||
    buildProjectTitle({
      programFamily: data.programFamily,
      programLabel: programLabel(data.programFamily, data.locale),
      peopleNames: resolved.people.map((p) => p.displayName),
    });

  const statusAt = new Date().toISOString().slice(0, 10);
  const submitBefore = data.submitBefore || null;
  const { data: project, error: projectError } = await supabase
    .from("immigration_projects")
    .insert({
      organization_id: orgId,
      title,
      status: "new",
      status_at: statusAt,
      submit_before: submitBefore,
      jurisdiction,
      program_family: data.programFamily,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("create project:", projectError?.message);
    return { error: "create_failed" };
  }

  const user = await getSessionUser();
  await recordProjectStatusHistory(supabase, {
    organizationId: orgId,
    projectId: project.id as string,
    status: "new",
    statusAt,
    changedBy: user?.id ?? null,
  });

  const { error: linksError } = await supabase.from("project_participants").insert(
    resolved.people.map((person) => ({
      organization_id: orgId,
      project_id: project.id,
      person_id: person.id,
      role: person.role,
    })),
  );

  if (linksError) {
    console.error("create participants:", linksError.message);
    return { error: "create_failed" };
  }

  redirect(`/${data.locale}/projects/${project.id}`);
}

export async function updateProjectAction(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const projectId = String(formData.get("projectId") || "");
  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: "invalid" };
  }

  const parsed = parseProjectForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { data } = parsed;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const jurisdiction =
    data.jurisdiction ?? defaultJurisdictionForProgram(data.programFamily);
  const status = (data.status ?? "new") as ProjectStatus;
  const statusAt =
    data.statusAt ?? new Date().toISOString().slice(0, 10);

  const resolved = await resolveParticipants(
    orgId,
    data.locale,
    data.participants,
  );
  if ("error" in resolved) return { error: resolved.error };

  const title =
    data.title ||
    buildProjectTitle({
      programFamily: data.programFamily,
      programLabel: programLabel(data.programFamily, data.locale),
      peopleNames: resolved.people.map((p) => p.displayName),
    });

  const { data: existingProject, error: existingError } = await supabase
    .from("immigration_projects")
    .select("id, status, status_at")
    .eq("organization_id", orgId)
    .eq("id", projectId)
    .maybeSingle();

  if (existingError || !existingProject) {
    return { error: "not_found" };
  }

  const { error: updateError } = await supabase
    .from("immigration_projects")
    .update({
      title,
      status,
      status_at: statusAt,
      submit_before: data.submitBefore || null,
      jurisdiction,
      program_family: data.programFamily,
      closed_at: isTerminalStatus(status) ? `${statusAt}T12:00:00.000Z` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("update project:", updateError.message);
    return { error: "update_failed" };
  }

  if (
    statusChanged(
      {
        status: existingProject.status as string,
        status_at: existingProject.status_at as string,
      },
      { status, statusAt },
    )
  ) {
    const user = await getSessionUser();
    await recordProjectStatusHistory(supabase, {
      organizationId: orgId,
      projectId,
      status,
      statusAt,
      changedBy: user?.id ?? null,
    });
  }

  const { data: currentLinks, error: linksReadError } = await supabase
    .from("project_participants")
    .select("id, person_id, role, left_at")
    .eq("organization_id", orgId)
    .eq("project_id", projectId);

  if (linksReadError) {
    console.error("read participants:", linksReadError.message);
    return { error: "update_failed" };
  }

  const desiredIds = new Set(resolved.people.map((p) => p.id));
  const now = new Date().toISOString();

  for (const link of currentLinks ?? []) {
    const personId = link.person_id as string;
    if (!link.left_at && !desiredIds.has(personId)) {
      const { error } = await supabase
        .from("project_participants")
        .update({ left_at: now })
        .eq("id", link.id);
      if (error) {
        console.error("unlink participant:", error.message);
        return { error: "update_failed" };
      }
    }
  }

  const linksByPerson = new Map(
    (currentLinks ?? []).map((link) => [link.person_id as string, link]),
  );

  for (const person of resolved.people) {
    const existing = linksByPerson.get(person.id);
    if (!existing) {
      const { error } = await supabase.from("project_participants").insert({
        organization_id: orgId,
        project_id: projectId,
        person_id: person.id,
        role: person.role,
      });
      if (error) {
        console.error("insert participant:", error.message);
        return { error: "update_failed" };
      }
      continue;
    }

    if (existing.left_at || existing.role !== person.role) {
      const { error } = await supabase
        .from("project_participants")
        .update({
          left_at: null,
          role: person.role,
        })
        .eq("id", existing.id);
      if (error) {
        console.error("reactivate participant:", error.message);
        return { error: "update_failed" };
      }
    }
  }

  revalidatePath(`/${data.locale}/projects/${projectId}`);
  revalidatePath(`/${data.locale}/projects`);
  revalidatePath(`/${data.locale}/people`);
  revalidatePath(`/${data.locale}/home`);
  redirect(`/${data.locale}/projects/${projectId}`);
}

export type StatusUpdateState = {
  error?: string;
};

export async function updateProjectStatusAction(
  _prev: StatusUpdateState,
  formData: FormData,
): Promise<StatusUpdateState> {
  const locale = (formData.get("locale") as "en" | "fr") || "en";
  const projectId = String(formData.get("projectId") || "");
  const statusRaw = String(formData.get("status") || "");
  const statusAtRaw = String(formData.get("statusAt") || "").trim();

  const parsed = z
    .object({
      projectId: z.string().uuid(),
      status: statusSchema,
      statusAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse({
      projectId,
      status: statusRaw,
      statusAt: statusAtRaw || new Date().toISOString().slice(0, 10),
    });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${locale}/onboarding`);
  }

  const supabase = await createClient();
  const { status, statusAt } = parsed.data;

  const { data: existing, error: existingError } = await supabase
    .from("immigration_projects")
    .select("id, status, status_at")
    .eq("organization_id", orgId)
    .eq("id", parsed.data.projectId)
    .maybeSingle();

  if (existingError || !existing) {
    return { error: "not_found" };
  }

  const { error: updateError } = await supabase
    .from("immigration_projects")
    .update({
      status,
      status_at: statusAt,
      closed_at: isTerminalStatus(status) ? `${statusAt}T12:00:00.000Z` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.projectId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("update status:", updateError.message);
    return { error: "update_failed" };
  }

  if (
    statusChanged(
      {
        status: existing.status as string,
        status_at: existing.status_at as string,
      },
      { status, statusAt },
    )
  ) {
    const user = await getSessionUser();
    await recordProjectStatusHistory(supabase, {
      organizationId: orgId,
      projectId: parsed.data.projectId,
      status,
      statusAt,
      changedBy: user?.id ?? null,
    });
  }

  revalidatePath(`/${locale}/projects/${parsed.data.projectId}`);
  revalidatePath(`/${locale}/projects`);
  revalidatePath(`/${locale}/home`);
  redirect(`/${locale}/projects/${parsed.data.projectId}`);
}
