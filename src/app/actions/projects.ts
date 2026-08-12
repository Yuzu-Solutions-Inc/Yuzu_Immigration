"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ParticipantRole, ProgramFamily, ProjectStatus } from "@/db/schema";
import {
  PROGRAM_FAMILIES,
  SELECTABLE_PROGRAM_FAMILIES,
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
  programFamily: z.enum(["study_permit", "work_permit", "visitor"]).optional(),
  applicationLocation: z.enum(["outside", "inside"]).optional(),
  needsCustodian: z.enum(["Y", "N"]).optional(),
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
  locale: z.enum(["en", "fr", "es"]).default("en"),
  composition: z.enum(["individual", "couple", "family"]),
  programFamily: z.enum(PROGRAM_FAMILIES as [ProgramFamily, ...ProgramFamily[]]),
  jurisdiction: z.enum(["federal"]).optional(),
  formLanguage: z.enum(["en", "fr"]).default("en"),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(10000).optional().or(z.literal("")),
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
  representativeUserId: z.string().uuid().optional().or(z.literal("")),
  applicationLocation: z.enum(["outside", "inside"]).optional(),
  isCommonLaw: z.enum(["Y", "N"]).optional(),
  needsCustodian: z.enum(["Y", "N"]).optional(),
  participants: z.array(participantInputSchema).min(1),
});

export type ProjectActionState = {
  error?: string;
};

/** @deprecated Prefer ProjectActionState */
export type CreateProjectState = ProjectActionState;

function personKitsFromParticipantInputs(
  people: Array<{ id: string }>,
  participants: Array<{
    programFamily?: "study_permit" | "work_permit" | "visitor";
    applicationLocation?: "outside" | "inside";
    needsCustodian?: "Y" | "N";
  }>,
) {
  const kits: Record<
    string,
    {
      programFamily: "study_permit" | "work_permit" | "visitor";
      applicationLocation: "outside" | "inside";
      needsCustodian?: boolean;
    }
  > = {};
  people.forEach((person, index) => {
    const input = participants[index];
    kits[person.id] = {
      programFamily: input?.programFamily ?? "work_permit",
      applicationLocation: input?.applicationLocation ?? "outside",
      ...(input?.needsCustodian === "Y" ? { needsCustodian: true } : {}),
    };
  });
  return kits;
}

function programLabel(family: ProgramFamily, locale: string) {
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
    other: { en: "Custom project", fr: "Projet personnalisé" },
  };
  return locale === "fr" ? labels[family].fr : labels[family].en;
}

function parseProjectForm(formData: FormData) {
  const locale = (formData.get("locale") as "en" | "fr" | "es") || "en";
  const composition = formData.get("composition") as ProjectComposition;
  const programFamily = formData.get("programFamily") as ProgramFamily;
  const jurisdictionRaw = "federal";
  const formLanguageRaw = String(formData.get("formLanguage") || "").trim();
  const titleRaw = String(formData.get("title") || "").trim();
  const descriptionRaw = String(formData.get("description") || "").trim();
  const notesRaw = String(formData.get("notes") || "").trim();
  const statusRaw = String(formData.get("status") || "").trim();
  const statusAtRaw = String(formData.get("statusAt") || "").trim();
  const submitBeforeRaw = String(formData.get("submitBefore") || "").trim();
  const representativeUserIdRaw = String(
    formData.get("representativeUserId") || "",
  ).trim();
  const applicationLocationRaw = String(
    formData.get("applicationLocation") || "",
  ).trim();
  const isCommonLawRaw = String(formData.get("isCommonLaw") || "").trim();
  const needsCustodianRaw = String(formData.get("needsCustodian") || "").trim();

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
    formLanguage: formLanguageRaw || (locale === "fr" ? "fr" : "en"),
    title: titleRaw || undefined,
    description: descriptionRaw || undefined,
    notes: notesRaw || undefined,
    status: statusRaw || undefined,
    statusAt: statusAtRaw || undefined,
    submitBefore: submitBeforeRaw || undefined,
    representativeUserId: representativeUserIdRaw || undefined,
    applicationLocation: applicationLocationRaw || undefined,
    isCommonLaw: isCommonLawRaw || undefined,
    needsCustodian: needsCustodianRaw || undefined,
    participants: participantsParsed,
  });

  if (!parsed.success) {
    return { error: "invalid" as const };
  }

  return { data: parsed.data };
}

async function resolveParticipants(
  orgId: string,
  locale: string,
  participants: z.infer<typeof participantInputSchema>[],
): Promise<
  | { error: string }
  | {
      people: Array<{
        id: string;
        role: ParticipantRole;
        displayName: string;
        email: string | null;
      }>;
    }
> {
  const supabase = await createClient();
  const resolvedPeople: Array<{
    id: string;
    role: ParticipantRole;
    displayName: string;
    email: string | null;
  }> = [];
  const seen = new Set<string>();

  for (const participant of participants) {
    if (participant.personId) {
      const { data: existing, error } = await supabase
        .from("people")
        .select("id, first_name, last_name, email")
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
        email: (existing.email as string | null) || null,
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
    const email = participant.email || null;

    const { data: created, error: createError } = await supabase
      .from("people")
      .insert({
        organization_id: orgId,
        first_name: participant.firstName,
        last_name: participant.lastName,
        email,
        preferred_locale: locale,
        immigration_status: immigrationStatus,
        status_expires_at: statusExpiresAt,
      })
      .select("id, first_name, last_name, email")
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
      email: (created.email as string | null) || email,
    });
  }

  if (!resolvedPeople.some((p) => p.role === "principal")) {
    return { error: "principal_required" };
  }

  return { people: resolvedPeople };
}

async function resolveRepresentativeUserId(
  orgId: string,
  requestedId: string | undefined,
  fallbackUserId: string | null,
): Promise<string | null> {
  const candidate = requestedId || fallbackUserId;
  if (!candidate) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("user_id", candidate)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data.user_id as string;
}

export async function createProjectAction(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = parseProjectForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { data } = parsed;
  if (!SELECTABLE_PROGRAM_FAMILIES.includes(data.programFamily)) {
    return { error: "invalid" };
  }
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const jurisdiction = defaultJurisdictionForProgram(data.programFamily);

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
  const user = await getSessionUser();
  const representativeUserId = await resolveRepresentativeUserId(
    orgId,
    data.representativeUserId || undefined,
    user?.id ?? null,
  );

  const { data: project, error: projectError } = await supabase
    .from("immigration_projects")
    .insert({
      organization_id: orgId,
      title,
      description: data.description || null,
      notes: data.notes || null,
      status: "new",
      status_at: statusAt,
      submit_before: submitBefore,
      jurisdiction,
      program_family: data.programFamily,
      form_language: data.formLanguage,
      representative_user_id: representativeUserId,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("create project:", projectError?.message);
    return { error: "create_failed" };
  }

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

  try {
    const {
      detectCommonLaw,
      detectMinor,
      expandMixedPersonKits,
      expandSeedsForParticipants,
      isCustomProgram,
      resolveApplicationLocation,
      seedFormsForProgram,
    } = await import("@/lib/ircc/kits");
    const applicationLocation = resolveApplicationLocation(
      data.applicationLocation,
      data.programFamily,
    );
    const isCommonLaw = detectCommonLaw({
      isCommonLaw: data.isCommonLaw,
      participantRoles: resolved.people.map((p) => p.role),
    });
    const needsCustodian = detectMinor({
      needsCustodian: data.needsCustodian,
    });
    const personIds = [
      ...resolved.people.filter((p) => p.role === "principal").map((p) => p.id),
      ...resolved.people.filter((p) => p.role !== "principal").map((p) => p.id),
    ];
    const custom = isCustomProgram(data.programFamily);
    const personKits = custom
      ? personKitsFromParticipantInputs(resolved.people, data.participants)
      : {};
    const seeds = custom
      ? expandMixedPersonKits(
          personIds.map((personId) => ({
            personId,
            programFamily: personKits[personId]?.programFamily ?? "work_permit",
            applicationLocation:
              personKits[personId]?.applicationLocation ?? "outside",
            needsCustodian: personKits[personId]?.needsCustodian,
          })),
          { isCommonLaw },
        )
      : expandSeedsForParticipants(
          seedFormsForProgram(data.programFamily, {
            applicationLocation,
            isCommonLaw,
            needsCustodian,
          }),
          personIds,
        );
    const { error: formsError } = await supabase.from("project_forms").insert(
      seeds.map((seed) => ({
        organization_id: orgId,
        project_id: project.id,
        form_code: seed.formCode,
        person_id: seed.personId,
        is_required: seed.isRequired,
        sort_order: seed.sortOrder,
        status: "todo",
      })),
    );
    if (formsError) {
      console.error("seed project forms:", formsError.message);
    }

    const { defaultDocumentsForProgram } = await import(
      "@/lib/documents/catalog"
    );
    const docSeeds = defaultDocumentsForProgram(data.programFamily);
    const { error: docsError } = await supabase
      .from("project_document_requests")
      .insert(
        personIds.flatMap((personId) =>
          docSeeds.map((seed) => ({
            organization_id: orgId,
            project_id: project.id,
            person_id: personId,
            doc_key: seed.docKey,
            is_required: seed.isRequired,
            sort_order: seed.sortOrder,
            status: "requested",
          })),
        ),
      );
    if (docsError) {
      console.error("seed project documents:", docsError.message);
    }

    const { accountRepAnswersFromProfile, PROFILE_REP_SELECT } = await import(
      "@/lib/ircc/account-rep"
    );
    const { toIrccFormLanguage } = await import("@/lib/ircc/form-language");
    const { buildInitialAnswersStore } = await import(
      "@/lib/ircc/project-forms"
    );
    const { data: repProfile } = representativeUserId
      ? await supabase
          .from("profiles")
          .select(PROFILE_REP_SELECT)
          .eq("id", representativeUserId)
          .maybeSingle()
      : { data: null };

    const initialAnswers = buildInitialAnswersStore({
      people: resolved.people.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        email: p.email,
        role: p.role,
      })),
      formLanguage: toIrccFormLanguage(data.formLanguage),
      repAnswers: accountRepAnswersFromProfile(repProfile),
      projectAnswers: {
        applicationLocation,
        isCommonLaw: isCommonLaw ? "Y" : "N",
        needsCustodian: needsCustodian ? "Y" : "N",
      },
      personKits: custom ? personKits : undefined,
    });

    await supabase.from("project_form_answers").insert({
      organization_id: orgId,
      project_id: project.id,
      answers: initialAnswers,
      current_section: "identity",
    });
  } catch (error) {
    console.error("project forms bootstrap:", error);
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
  const jurisdiction = defaultJurisdictionForProgram(data.programFamily);
  const status = (data.status ?? "new") as ProjectStatus;
  const statusAt =
    data.statusAt ?? new Date().toISOString().slice(0, 10);

  const user = await getSessionUser();
  const representativeUserId = await resolveRepresentativeUserId(
    orgId,
    data.representativeUserId || undefined,
    user?.id ?? null,
  );

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
      description: data.description || null,
      notes: data.notes || null,
      status,
      status_at: statusAt,
      submit_before: data.submitBefore || null,
      jurisdiction,
      program_family: data.programFamily,
      form_language: data.formLanguage,
      representative_user_id: representativeUserId,
      closed_at: isTerminalStatus(status) ? `${statusAt}T12:00:00.000Z` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("update project:", updateError.message);
    return { error: "update_failed" };
  }

  const { toIrccFormLanguage } = await import("@/lib/ircc/form-language");
  const { mergeAccountRepIntoAnswers, PROFILE_REP_SELECT } = await import(
    "@/lib/ircc/account-rep"
  );
  const {
    normalizeAnswersStore,
    seedPersonIdentityFromName,
  } = await import("@/lib/ircc/answers-store");
  const principal = resolved.people.find((p) => p.role === "principal");
  const [{ data: answersRow }, { data: repProfile }] = await Promise.all([
    supabase
      .from("project_form_answers")
      .select("id, answers")
      .eq("project_id", projectId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    representativeUserId
      ? supabase
          .from("profiles")
          .select(PROFILE_REP_SELECT)
          .eq("id", representativeUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (answersRow) {
    const store = normalizeAnswersStore(answersRow.answers ?? {}, {
      principalPersonId: principal?.id,
    });
    const formLanguage = toIrccFormLanguage(data.formLanguage);
    const repAnswers = mergeAccountRepIntoAnswers({}, repProfile);
    const { detectCommonLaw, detectMinor, isCustomProgram, resolveApplicationLocation } =
      await import("@/lib/ircc/kits");
    store.project.applicationLocation = resolveApplicationLocation(
      data.applicationLocation,
      data.programFamily,
    );
    if (data.isCommonLaw) {
      store.project.isCommonLaw = detectCommonLaw({
        isCommonLaw: data.isCommonLaw,
        participantRoles: resolved.people.map((p) => p.role),
      })
        ? "Y"
        : "N";
    }
    if (data.needsCustodian) {
      store.project.needsCustodian = detectMinor({
        needsCustodian: data.needsCustodian,
      })
        ? "Y"
        : "N";
    }
    if (isCustomProgram(data.programFamily)) {
      store.project.personKits = personKitsFromParticipantInputs(
        resolved.people,
        data.participants,
      );
    } else {
      delete store.project.personKits;
    }

    for (const person of resolved.people) {
      const existing = store.byPerson[person.id] ?? {};
      store.byPerson[person.id] = {
        ...seedPersonIdentityFromName(person.displayName, person.email),
        ...existing,
        formLanguage,
        ...repAnswers,
        email: person.email || existing.email || "",
        hasRepresentative: "Y",
      };
    }

    await supabase
      .from("project_form_answers")
      .update({
        answers: store,
        updated_at: new Date().toISOString(),
      })
      .eq("id", answersRow.id);
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

  try {
    const { ensureProjectDocumentsSeeded } = await import(
      "@/lib/documents/service"
    );
    await ensureProjectDocumentsSeeded(
      orgId,
      projectId,
      data.programFamily,
      resolved.people.map((p) => p.id),
    );
  } catch (error) {
    console.error("ensure documents on update:", error);
  }

  try {
    const {
      kitOptionsFromAnswersStore,
      personKitAssignments,
      personKitsFromAnswersStore,
      reconcileProjectKitForms,
    } = await import("@/lib/ircc/project-forms");
    const {
      detectCommonLaw,
      detectMinor,
      isCustomProgram,
      resolveApplicationLocation,
    } = await import("@/lib/ircc/kits");
    const { data: latestAnswers } = await supabase
      .from("project_form_answers")
      .select("answers")
      .eq("project_id", projectId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const store = normalizeAnswersStore(latestAnswers?.answers ?? {}, {
      principalPersonId: principal?.id,
    });
    const { data: existingFormRows } = await supabase
      .from("project_forms")
      .select("form_code")
      .eq("project_id", projectId)
      .eq("organization_id", orgId);
    const kit = kitOptionsFromAnswersStore(
      store,
      data.programFamily,
      resolved.people.map((p) => p.role),
      (existingFormRows ?? []).map((r: { form_code: string }) => r.form_code),
    );
    const personIds = [
      ...resolved.people.filter((p) => p.role === "principal").map((p) => p.id),
      ...resolved.people.filter((p) => p.role !== "principal").map((p) => p.id),
    ];
    await reconcileProjectKitForms({
      organizationId: orgId,
      projectId,
      programFamily: data.programFamily,
      personIds,
      applicationLocation: resolveApplicationLocation(
        data.applicationLocation,
        data.programFamily,
      ),
      isCommonLaw:
        data.isCommonLaw != null
          ? detectCommonLaw({
              isCommonLaw: data.isCommonLaw,
              participantRoles: resolved.people.map((p) => p.role),
            })
          : kit.isCommonLaw,
      needsCustodian:
        data.needsCustodian != null
          ? detectMinor({ needsCustodian: data.needsCustodian })
          : kit.needsCustodian,
      personKits: isCustomProgram(data.programFamily)
        ? personKitAssignments(personIds, personKitsFromAnswersStore(store))
        : undefined,
    });
  } catch (error) {
    console.error("sync person forms after participant update:", error);
  }

  revalidatePath(`/${data.locale}/projects/${projectId}`);
  revalidatePath(`/${data.locale}/projects`);
  revalidatePath(`/${data.locale}/people`);
  revalidatePath(`/${data.locale}/home`);
  redirect(`/${data.locale}/projects/${projectId}`);
}

export type StatusUpdateState = {
  error?: string;
  updated?: number;
};

async function applyProjectStatuses(params: {
  locale: string;
  projectIds: string[];
  status: ProjectStatus;
  statusAt: string;
}): Promise<StatusUpdateState> {
  const { locale, projectIds, status, statusAt } = params;
  if (projectIds.length === 0 || projectIds.length > 100) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${locale}/onboarding`);
  }

  const supabase = await createClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("immigration_projects")
    .select("id, status, status_at")
    .eq("organization_id", orgId)
    .in("id", projectIds);

  if (existingError) {
    console.error("load projects for status:", existingError.message);
    return { error: "update_failed" };
  }

  const existingById = new Map(
    (existingRows ?? []).map((row) => [row.id as string, row]),
  );

  if (existingById.size !== projectIds.length) {
    return { error: "not_found" };
  }

  const user = await getSessionUser();
  const now = new Date().toISOString();
  let updated = 0;

  for (const projectId of projectIds) {
    const existing = existingById.get(projectId);
    if (!existing) {
      return { error: "not_found" };
    }

    const { error: updateError } = await supabase
      .from("immigration_projects")
      .update({
        status,
        status_at: statusAt,
        closed_at: isTerminalStatus(status) ? `${statusAt}T12:00:00.000Z` : null,
        updated_at: now,
      })
      .eq("id", projectId)
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
      await recordProjectStatusHistory(supabase, {
        organizationId: orgId,
        projectId,
        status,
        statusAt,
        changedBy: user?.id ?? null,
      });
    }

    updated += 1;
  }

  for (const projectId of projectIds) {
    revalidatePath(`/${locale}/projects/${projectId}`);
  }
  revalidatePath(`/${locale}/projects`);
  revalidatePath(`/${locale}/home`);

  return { updated };
}

export async function updateProjectStatusAction(
  _prev: StatusUpdateState,
  formData: FormData,
): Promise<StatusUpdateState> {
  const locale = (formData.get("locale") as "en" | "fr" | "es") || "en";
  const projectId = String(formData.get("projectId") || "");
  const statusRaw = String(formData.get("status") || "");
  const statusAtRaw = String(formData.get("statusAt") || "").trim();
  const returnTo = String(formData.get("returnTo") || "detail");

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

  const result = await applyProjectStatuses({
    locale,
    projectIds: [parsed.data.projectId],
    status: parsed.data.status,
    statusAt: parsed.data.statusAt,
  });

  if (result.error) {
    return result;
  }

  if (returnTo === "list") {
    return result;
  }

  redirect(`/${locale}/projects/${parsed.data.projectId}`);
}

export async function setProjectsStatusAction(input: {
  locale: string;
  projectIds: string[];
  status: ProjectStatus;
  statusAt?: string;
}): Promise<StatusUpdateState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]),
      projectIds: z.array(z.string().uuid()).min(1).max(100),
      status: statusSchema,
      statusAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse({
      locale: input.locale,
      projectIds: input.projectIds,
      status: input.status,
      statusAt: input.statusAt || new Date().toISOString().slice(0, 10),
    });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  return applyProjectStatuses(parsed.data);
}
