import { createHash, randomBytes } from "node:crypto";

import type { ProgramFamily } from "@/db/schema";
import {
  detectCommonLaw,
  expandSeedsForParticipants,
  inferApplicationLocationFromForms,
  isWorkPermitProgram,
  resolveApplicationLocation,
  seedFormsForProgram,
  type ApplicationLocation,
} from "@/lib/ircc/kits";
import {
  formScope,
  isFormCode,
  isPersonScopedForm,
  type FormCode,
} from "@/lib/ircc/catalog";
import {
  emptyAnswersStore,
  mergePersonQuestionnaireSave,
  normalizeAnswersStore,
  seedPersonIdentityFromName,
  type FlatAnswers,
  type ProjectAnswersStore,
} from "@/lib/ircc/answers-store";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  mergeAccountRepIntoAnswers,
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CANONICAL_FIELDS } from "@/lib/ircc/fields";

export const SHARE_LINK_TTL_DAYS = 30;

/** Questionnaire keys that belong on the project bag (IMM 5409 etc.). */
export const PROJECT_SCOPED_ANSWER_KEYS: string[] = [
  ...CANONICAL_FIELDS.filter(
    (field) =>
      field.forms?.length &&
      field.forms.every((code) => formScope(code) === "project"),
  ).map((field) => field.key),
  "applicationLocation",
  "isCommonLaw",
  "partnerFamilyName",
  "partnerGivenName",
  "yearsTogether",
  "commonLawCity",
  "commonLawProvince",
  "commonLawCountry",
  "commonLawStart",
];

export type ProjectFormRow = {
  id: string;
  organization_id: string;
  project_id: string;
  form_code: string;
  person_id: string | null;
  status: "todo" | "in_progress" | "ready" | "generated";
  is_required: boolean;
  sort_order: number;
  generated_storage_path: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectFormAnswersRow = {
  id: string;
  organization_id: string;
  project_id: string;
  answers: Record<string, unknown>;
  current_section: string | null;
  created_at: string;
  updated_at: string;
};

export type FormShareLinkRow = {
  id: string;
  organization_id: string;
  project_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

export type ProjectPersonBrief = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
};

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function listActiveProjectPeople(
  client: DbClient,
  projectId: string,
): Promise<ProjectPersonBrief[]> {
  const { data: links, error } = await client
    .from("project_participants")
    .select("role, person_id, created_at")
    .eq("project_id", projectId)
    .is("left_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listActiveProjectPeople:", error.message);
    return [];
  }

  const personIds = (links ?? [])
    .map((row: { person_id: string }) => row.person_id)
    .filter(Boolean);
  if (personIds.length === 0) return [];

  const { data: peopleRows, error: peopleError } = await client
    .from("people")
    .select("id, first_name, last_name, email")
    .in("id", personIds);

  if (peopleError) {
    console.error("listActiveProjectPeople people:", peopleError.message);
    return [];
  }

  type PersonRow = {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  };

  const byId = new Map<string, PersonRow>(
    ((peopleRows ?? []) as PersonRow[]).map((person) => [person.id, person]),
  );

  const out: ProjectPersonBrief[] = [];
  for (const row of links ?? []) {
    const person = byId.get(row.person_id as string);
    if (!person) continue;
    out.push({
      id: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      email: person.email,
      role: String(row.role),
    });
  }

  out.sort((a, b) => {
    if (a.role === "principal" && b.role !== "principal") return -1;
    if (b.role === "principal" && a.role !== "principal") return 1;
    return 0;
  });

  return out;
}

export async function seedProjectForms(
  organizationId: string,
  projectId: string,
  programFamily: ProgramFamily,
  options?: {
    applicationLocation?: ApplicationLocation;
    isCommonLaw?: boolean;
    personIds?: string[];
  },
) {
  const supabase = await createClient();
  const personIds =
    options?.personIds ??
    (await listActiveProjectPeople(supabase, projectId)).map((p) => p.id);
  const seeds = expandSeedsForParticipants(
    seedFormsForProgram(programFamily, {
      applicationLocation: options?.applicationLocation,
      isCommonLaw: options?.isCommonLaw,
    }),
    personIds,
  );
  const { error } = await supabase.from("project_forms").insert(
    seeds.map((seed) => ({
      organization_id: organizationId,
      project_id: projectId,
      form_code: seed.formCode,
      person_id: seed.personId,
      is_required: seed.isRequired,
      sort_order: seed.sortOrder,
      status: "todo",
    })),
  );
  if (error) {
    console.error("seedProjectForms:", error.message);
    throw new Error(error.message);
  }
}

/**
 * Ensure every active participant has a copy of each person-scoped form
 * already on the project (kit or manually added). Project-scoped rows stay
 * single.
 */
export async function syncPersonScopedFormsForParticipants(input: {
  organizationId: string;
  projectId: string;
  personIds: string[];
}) {
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("project_forms")
    .select("id, form_code, person_id, is_required, sort_order")
    .eq("project_id", input.projectId)
    .eq("organization_id", input.organizationId);

  if (error) {
    console.error("syncPersonScopedFormsForParticipants:", error.message);
    throw new Error(error.message);
  }

  const rows = (existing ?? []) as Array<{
    id: string;
    form_code: string;
    person_id: string | null;
    is_required: boolean;
    sort_order: number;
  }>;

  const personScopedCodes = [
    ...new Set(
      rows
        .filter((r) => isPersonScopedForm(r.form_code))
        .map((r) => r.form_code),
    ),
  ];

  if (personScopedCodes.length === 0 || input.personIds.length === 0) return;

  const have = new Set(
    rows
      .filter((r) => r.person_id)
      .map((r) => `${r.form_code}:${r.person_id}`),
  );

  const inserts: Array<{
    organization_id: string;
    project_id: string;
    form_code: string;
    person_id: string;
    is_required: boolean;
    sort_order: number;
    status: "todo";
  }> = [];

  for (const code of personScopedCodes) {
    const template = rows.find(
      (r) => r.form_code === code && r.person_id != null,
    ) ?? rows.find((r) => r.form_code === code);

    for (const personId of input.personIds) {
      const key = `${code}:${personId}`;
      if (have.has(key)) continue;
      inserts.push({
        organization_id: input.organizationId,
        project_id: input.projectId,
        form_code: code,
        person_id: personId,
        is_required: template?.is_required ?? true,
        sort_order: (template?.sort_order ?? 50) + 1,
        status: "todo",
      });
      have.add(key);
    }
  }

  // Attach any leftover unassigned person-scoped rows to the first person.
  const unassigned = rows.filter(
    (r) => isPersonScopedForm(r.form_code) && !r.person_id,
  );
  const primaryPersonId = input.personIds[0];
  if (primaryPersonId && unassigned.length > 0) {
    for (const row of unassigned) {
      const key = `${row.form_code}:${primaryPersonId}`;
      if (have.has(key)) {
        await supabase.from("project_forms").delete().eq("id", row.id);
        continue;
      }
      await supabase
        .from("project_forms")
        .update({ person_id: primaryPersonId })
        .eq("id", row.id);
      have.add(key);
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("project_forms")
      .insert(inserts);
    if (insertError) {
      console.error("syncPersonScopedForms insert:", insertError.message);
      throw new Error(insertError.message);
    }
  }
}

const OBSOLETE_WORK_PERMIT_FORMS = new Set(["imm5488", "imm5556"]);
const MANAGED_WORK_PERMIT_FORMS = new Set([
  "imm1295",
  "imm5710",
  "imm5707",
  "imm5406",
  "imm5476",
  "imm5409",
  "imm5488",
  "imm5556",
]);

function formRowKey(formCode: string, personId: string | null): string {
  return `${formCode}:${personId ?? ""}`;
}

/**
 * Align a work-permit file to the federal kit (in/out + common-law + always 5476).
 * Removes old WP checklists. Study / other programs only sync person copies.
 */
export async function reconcileProjectKitForms(input: {
  organizationId: string;
  projectId: string;
  programFamily: ProgramFamily | string;
  personIds: string[];
  applicationLocation?: ApplicationLocation;
  isCommonLaw?: boolean;
  client?: DbClient;
}) {
  const supabase = input.client ?? (await createClient());
  if (!isWorkPermitProgram(input.programFamily)) {
    if (input.client) return;
    await syncPersonScopedFormsForParticipants({
      organizationId: input.organizationId,
      projectId: input.projectId,
      personIds: input.personIds,
    });
    return;
  }

  const location = resolveApplicationLocation(
    input.applicationLocation,
    input.programFamily,
  );
  const desired = expandSeedsForParticipants(
    seedFormsForProgram(input.programFamily as ProgramFamily, {
      applicationLocation: location,
      isCommonLaw: input.isCommonLaw,
    }),
    input.personIds,
  );
  const desiredKeys = new Set(
    desired.map((seed) => formRowKey(seed.formCode, seed.personId)),
  );

  const { data: existing, error } = await supabase
    .from("project_forms")
    .select("id, form_code, person_id, is_required, sort_order")
    .eq("project_id", input.projectId)
    .eq("organization_id", input.organizationId);

  if (error) {
    console.error("reconcileProjectKitForms:", error.message);
    throw new Error(error.message);
  }

  const rows = (existing ?? []) as Array<{
    id: string;
    form_code: string;
    person_id: string | null;
    is_required: boolean;
    sort_order: number;
  }>;

  const toDelete = rows.filter((row) => {
    if (OBSOLETE_WORK_PERMIT_FORMS.has(row.form_code)) return true;
    if (!MANAGED_WORK_PERMIT_FORMS.has(row.form_code)) return false;
    return !desiredKeys.has(formRowKey(row.form_code, row.person_id));
  });

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("project_forms")
      .delete()
      .in(
        "id",
        toDelete.map((row) => row.id),
      );
    if (deleteError) {
      console.error("reconcileProjectKitForms delete:", deleteError.message);
      throw new Error(deleteError.message);
    }
  }

  const remainingKeys = new Set(
    rows
      .filter((row) => !toDelete.some((d) => d.id === row.id))
      .map((row) => formRowKey(row.form_code, row.person_id)),
  );

  const inserts = desired
    .filter((seed) => !remainingKeys.has(formRowKey(seed.formCode, seed.personId)))
    .map((seed) => ({
      organization_id: input.organizationId,
      project_id: input.projectId,
      form_code: seed.formCode,
      person_id: seed.personId,
      is_required: seed.isRequired,
      sort_order: seed.sortOrder,
      status: "todo" as const,
    }));

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("project_forms")
      .insert(inserts);
    if (insertError) {
      console.error("reconcileProjectKitForms insert:", insertError.message);
      throw new Error(insertError.message);
    }
  }
}

export function kitOptionsFromAnswersStore(
  store: ProjectAnswersStore,
  programFamily: ProgramFamily | string,
  participantRoles: string[] = [],
  existingFormCodes: string[] = [],
): {
  applicationLocation: ApplicationLocation;
  isCommonLaw: boolean;
} {
  const projectLoc = store.project.applicationLocation;
  const personLoc = Object.values(store.byPerson).find((bag) => {
    const loc = String(bag.applicationLocation || "");
    return loc === "inside" || loc === "outside";
  })?.applicationLocation;
  const maritalStatus = Object.values(store.byPerson).find(
    (bag) => bag.maritalStatus,
  )?.maritalStatus;
  const inferred = inferApplicationLocationFromForms(existingFormCodes);

  return {
    applicationLocation: resolveApplicationLocation(
      projectLoc || personLoc || inferred,
      programFamily,
    ),
    isCommonLaw: detectCommonLaw({
      isCommonLaw: store.project.isCommonLaw,
      maritalStatus,
      participantRoles,
    }),
  };
}

export async function listProjectForms(
  projectId: string,
): Promise<ProjectFormRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_forms")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("listProjectForms:", error.message);
    return [];
  }
  return (data ?? []) as ProjectFormRow[];
}

export async function getProjectFormAnswers(
  projectId: string,
): Promise<ProjectFormAnswersRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_form_answers")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("getProjectFormAnswers:", error.message);
    return null;
  }
  return data as ProjectFormAnswersRow | null;
}

export async function loadProjectAnswersStore(
  projectId: string,
  principalPersonId?: string | null,
): Promise<ProjectAnswersStore> {
  const row = await getProjectFormAnswers(projectId);
  return normalizeAnswersStore(row?.answers ?? {}, { principalPersonId });
}

export async function upsertProjectFormAnswers(input: {
  organizationId: string;
  projectId: string;
  answers: ProjectAnswersStore | FlatAnswers;
  currentSection?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_form_answers").upsert(
    {
      organization_id: input.organizationId,
      project_id: input.projectId,
      answers: input.answers,
      current_section: input.currentSection ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) {
    console.error("upsertProjectFormAnswers:", error.message);
    throw new Error(error.message);
  }
}

export async function addProjectForm(input: {
  organizationId: string;
  projectId: string;
  formCode: FormCode;
  personId?: string | null;
  isRequired?: boolean;
}) {
  if (!isFormCode(input.formCode)) {
    throw new Error("Invalid form code");
  }
  const supabase = await createClient();
  const scope = formScope(input.formCode);
  let personId = input.personId ?? null;

  if (scope === "person") {
    if (!personId) {
      const people = await listActiveProjectPeople(supabase, input.projectId);
      personId = people[0]?.id ?? null;
    }
    if (!personId) {
      throw new Error("person_required");
    }
  } else {
    personId = null;
  }

  const { data: existing } = await supabase
    .from("project_forms")
    .select("sort_order")
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((existing?.sort_order as number | undefined) ?? 0) + 10;
  const { error } = await supabase.from("project_forms").insert({
    organization_id: input.organizationId,
    project_id: input.projectId,
    form_code: input.formCode,
    person_id: personId,
    is_required: input.isRequired ?? false,
    sort_order: sortOrder,
    status: "todo",
  });
  if (error) {
    console.error("addProjectForm:", error.message);
    throw new Error(error.message);
  }
}

export async function getActiveShareLink(
  projectId: string,
): Promise<FormShareLinkRow | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("form_share_links")
    .select("*")
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getActiveShareLink:", error.message);
    return null;
  }
  return data as FormShareLinkRow | null;
}

/** Resolve a client share token via service role (no staff session). */
export async function resolveShareToken(token: string): Promise<{
  organizationId: string;
  projectId: string;
  linkId: string;
  expiresAt: string;
} | null> {
  const hash = hashShareToken(token);
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("form_share_links")
    .select("id, organization_id, project_id, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  await admin
    .from("form_share_links")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    organizationId: data.organization_id as string,
    projectId: data.project_id as string,
    linkId: data.id as string,
    expiresAt: data.expires_at as string,
  };
}

function injectPersonContact(
  answers: FlatAnswers,
  person: ProjectPersonBrief | undefined,
): FlatAnswers {
  if (!person) return answers;
  const next = { ...answers };
  const email = String(person.email ?? "").trim();
  if (email) next.email = email;
  if (!next.familyName) next.familyName = person.lastName;
  if (!next.givenName) next.givenName = person.firstName;
  if (!next.phone && person) {
    // phone stays on people table only when present via answers
  }
  return next;
}

export async function loadShareContext(token: string) {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;

  const admin = createServiceClient();
  const [projectRes, formsRes, answersRes, orgRes, people] = await Promise.all([
    admin
      .from("immigration_projects")
      .select(
        "id, title, program_family, organization_id, form_language, representative_user_id",
      )
      .eq("id", resolved.projectId)
      .maybeSingle(),
    admin
      .from("project_forms")
      .select("*")
      .eq("project_id", resolved.projectId)
      .order("sort_order", { ascending: true }),
    admin
      .from("project_form_answers")
      .select("*")
      .eq("project_id", resolved.projectId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("id, name")
      .eq("id", resolved.organizationId)
      .maybeSingle(),
    listActiveProjectPeople(admin, resolved.projectId),
  ]);

  const loadError =
    projectRes.error || formsRes.error || answersRes.error || orgRes.error;
  if (loadError) {
    console.error("loadShareContext:", loadError.message);
    throw new Error(`share_context_failed: ${loadError.message}`);
  }

  if (!projectRes.data) return null;

  const project = projectRes.data;
  const principal = people.find((p) => p.role === "principal") ?? people[0];
  const store = normalizeAnswersStore(answersRes.data?.answers ?? {}, {
    principalPersonId: principal?.id,
  });

  const repUserId = project.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await admin
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const peopleWithAnswers = people.map((person) => {
    const formCodes = (formsRes.data ?? [])
      .filter(
        (f: ProjectFormRow) =>
          f.person_id === person.id ||
          (person.role === "principal" && !f.person_id),
      )
      .map((f: ProjectFormRow) => f.form_code as string);

    const merged = withProjectFormLanguage(
      mergeAccountRepIntoAnswers(
        injectPersonContact(
          {
            ...store.byPerson[person.id],
            ...(person.role === "principal" ? store.project : {}),
          },
          person,
        ),
        repProfile,
      ),
      project.form_language,
    );

    return {
      ...person,
      formCodes,
      answers: merged,
    };
  });

  return {
    ...resolved,
    project,
    forms: (formsRes.data ?? []) as ProjectFormRow[],
    answersStore: store,
    people: peopleWithAnswers,
    currentSection:
      (answersRes.data?.current_section as string | null) ?? null,
    organization: orgRes.data,
  };
}

export async function saveShareAnswers(input: {
  token: string;
  personId: string;
  answers: Record<string, unknown>;
  currentSection?: string | null;
}) {
  const resolved = await resolveShareToken(input.token);
  if (!resolved) {
    throw new Error("expired");
  }
  const admin = createServiceClient();
  const people = await listActiveProjectPeople(admin, resolved.projectId);
  const person = people.find((p) => p.id === input.personId);
  if (!person) throw new Error("invalid_person");

  const { data: project } = await admin
    .from("immigration_projects")
    .select("form_language, representative_user_id, program_family")
    .eq("id", resolved.projectId)
    .maybeSingle();

  const repUserId = project?.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await admin
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const { data: answersRow } = await admin
    .from("project_form_answers")
    .select("answers")
    .eq("project_id", resolved.projectId)
    .maybeSingle();

  const principal = people.find((p) => p.role === "principal") ?? people[0];
  let store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: principal?.id,
  });

  const cleaned = withProjectFormLanguage(
    mergeAccountRepIntoAnswers(
      injectPersonContact(input.answers, person),
      repProfile,
    ),
    project?.form_language,
  );
  cleaned.hasRepresentative = "Y";

  store = mergePersonQuestionnaireSave(
    store,
    input.personId,
    cleaned,
    PROJECT_SCOPED_ANSWER_KEYS,
  );

  const { error } = await admin.from("project_form_answers").upsert(
    {
      organization_id: resolved.organizationId,
      project_id: resolved.projectId,
      answers: store,
      current_section: input.currentSection ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) throw new Error(error.message);

  const { data: existingShareForms } = await admin
    .from("project_forms")
    .select("form_code")
    .eq("project_id", resolved.projectId);
  const kit = kitOptionsFromAnswersStore(
    store,
    String(project?.program_family || ""),
    people.map((p) => p.role),
    (existingShareForms ?? []).map((r: { form_code: string }) => r.form_code),
  );
  await reconcileProjectKitForms({
    organizationId: resolved.organizationId,
    projectId: resolved.projectId,
    programFamily: String(project?.program_family || "other"),
    personIds: people.map((p) => p.id),
    applicationLocation: kit.applicationLocation,
    isCommonLaw: kit.isCommonLaw,
    client: admin,
  });
}

export function buildInitialAnswersStore(input: {
  people: Array<{
    id: string;
    displayName: string;
    email?: string | null;
    role: string;
  }>;
  formLanguage: string;
  repAnswers: FlatAnswers;
  projectAnswers?: FlatAnswers;
}): ProjectAnswersStore {
  const store = emptyAnswersStore();
  for (const person of input.people) {
    store.byPerson[person.id] = {
      ...seedPersonIdentityFromName(person.displayName, person.email),
      formLanguage: input.formLanguage,
      ...input.repAnswers,
      hasRepresentative: "Y",
    };
  }
  if (input.projectAnswers) {
    store.project = { ...input.projectAnswers };
  }
  return store;
}

export {
  emptyAnswersStore,
  mergePersonQuestionnaireSave,
  normalizeAnswersStore,
};
