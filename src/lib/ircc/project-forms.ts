import { createHash, randomBytes } from "node:crypto";

import { compareParticipantRole } from "@/lib/crm/programs";
import { isGrantedStatus } from "@/lib/crm/statuses";
import type { ProgramFamily } from "@/db/schema";
import {
  detectCommonLaw,
  detectMinor,
  expandMixedPersonKits,
  expandSeedsForParticipants,
  inferApplicationLocationFromForms,
  isCustomProgram,
  isFederalPermitProgram,
  isPermitKitFamily,
  resolveApplicationLocation,
  seedFormsForProgram,
  type ApplicationLocation,
  type PermitKitFamily,
  type PersonKitAssignment,
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
import { questionnaireFillCounts } from "@/lib/ircc/form-readiness";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { CANONICAL_FIELDS } from "@/lib/ircc/fields";
import {
  decryptAnswersValue,
  decryptPersonRow,
  decryptProjectRow,
  encryptAnswersValue,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";

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
  token_encrypted?: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

export type ActiveShareLink = {
  expires_at: string;
  canReveal: boolean;
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
    .select("id, first_name, last_name, email, organization_id")
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
    organization_id: string;
  };

  const peopleList = (peopleRows ?? []) as PersonRow[];
  const orgId = peopleList[0]?.organization_id;
  const key = orgId ? await getOrgDataKey(orgId) : Buffer.alloc(0);

  const byId = new Map<string, PersonRow>(
    peopleList.map((person) => [person.id, decryptPersonRow(person, key)]),
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

  out.sort((a, b) => compareParticipantRole(a.role, b.role));

  return out;
}

export function sortFormsPrincipalFirst<
  T extends { person_id: string | null; sort_order: number },
>(forms: T[], people: { id: string; role: string }[]): T[] {
  const rank = new Map<string, number>();
  [...people]
    .sort((a, b) => compareParticipantRole(a.role, b.role))
    .forEach((person, index) => rank.set(person.id, index));

  return [...forms].sort((a, b) => {
    const left = a.person_id ? (rank.get(a.person_id) ?? 99) : 0;
    const right = b.person_id ? (rank.get(b.person_id) ?? 99) : 0;
    if (left !== right) return left - right;
    return a.sort_order - b.sort_order;
  });
}

export async function seedProjectForms(
  organizationId: string,
  projectId: string,
  programFamily: ProgramFamily,
  options?: {
    applicationLocation?: ApplicationLocation;
    isCommonLaw?: boolean;
    needsCustodian?: boolean;
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
      needsCustodian: options?.needsCustodian,
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
  const formCountByPerson = new Map<string, number>();
  for (const row of rows) {
    if (!row.person_id) continue;
    formCountByPerson.set(
      row.person_id,
      (formCountByPerson.get(row.person_id) ?? 0) + 1,
    );
  }

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
      if ((formCountByPerson.get(personId) ?? 0) > 0) continue;
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

const OBSOLETE_PERMIT_FORMS = new Set(["imm5483", "imm5488", "imm5556"]);
const PRIMARY_PERMIT_FORMS = new Set([
  "imm1294",
  "imm5709",
  "imm1295",
  "imm5710",
  "imm5257",
  "imm5708",
]);
const FAMILY_PERMIT_FORMS = new Set(["imm5707", "imm5645", "imm5406"]);
const KIT_SWAP_FORMS = new Set([
  ...PRIMARY_PERMIT_FORMS,
  ...FAMILY_PERMIT_FORMS,
  "imm5257sch1",
  "imm5476",
]);

function formRowKey(formCode: string, personId: string | null): string {
  return `${formCode}:${personId ?? ""}`;
}

export type StoredPersonKit = {
  programFamily: PermitKitFamily;
  applicationLocation: ApplicationLocation;
  needsCustodian?: boolean;
};

function ynKitFlag(value: unknown): boolean {
  const flag = String(value ?? "").trim().toUpperCase();
  return flag === "Y" || flag === "YES" || flag === "TRUE" || flag === "1";
}

export function parseStoredPersonKit(raw: unknown): StoredPersonKit | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const bag = raw as Record<string, unknown>;
  if (!isPermitKitFamily(bag.programFamily)) return null;
  return {
    programFamily: bag.programFamily,
    applicationLocation:
      bag.applicationLocation === "inside" ? "inside" : "outside",
    needsCustodian: ynKitFlag(bag.needsCustodian) ? true : undefined,
  };
}

export function personKitsFromAnswersStore(
  store: ProjectAnswersStore,
): Record<string, StoredPersonKit> {
  const raw = store.project.personKits;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, StoredPersonKit> = {};
  for (const [personId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const kit = parseStoredPersonKit(value);
    if (kit) out[personId] = kit;
  }
  return out;
}

export function personKitAssignments(
  personIds: string[],
  kits: Record<string, StoredPersonKit>,
  fallback?: Partial<StoredPersonKit>,
): PersonKitAssignment[] {
  return personIds.filter(Boolean).map((personId) => {
    const kit = kits[personId];
    return {
      personId,
      programFamily: kit?.programFamily ?? fallback?.programFamily ?? "work_permit",
      applicationLocation:
        kit?.applicationLocation ?? fallback?.applicationLocation ?? "outside",
      needsCustodian: kit?.needsCustodian ?? fallback?.needsCustodian,
    };
  });
}

/**
 * Align a federal permit file to the current kit (in/out, common-law, minor).
 * Swaps primary / family forms when application location changes.
 */
export async function reconcileProjectKitForms(input: {
  organizationId: string;
  projectId: string;
  programFamily: ProgramFamily | string;
  personIds: string[];
  applicationLocation?: ApplicationLocation;
  isCommonLaw?: boolean;
  needsCustodian?: boolean;
  personKits?: PersonKitAssignment[];
  client?: DbClient;
}) {
  const supabase = input.client ?? (await createClient());
  const custom = isCustomProgram(input.programFamily);
  if (!isFederalPermitProgram(input.programFamily) && !custom) {
    if (input.client) return;
    await syncPersonScopedFormsForParticipants({
      organizationId: input.organizationId,
      projectId: input.projectId,
      personIds: input.personIds,
    });
    return;
  }

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

  const existingCodes = new Set(rows.map((row) => row.form_code));
  const location = resolveApplicationLocation(
    input.applicationLocation ??
      inferApplicationLocationFromForms([...existingCodes]),
    custom ? "work_permit" : input.programFamily,
  );
  const desired = custom
    ? expandMixedPersonKits(
        input.personKits?.length
          ? input.personKits
          : personKitAssignments(input.personIds, {}, {
              programFamily: "work_permit",
              applicationLocation: location,
              needsCustodian: input.needsCustodian,
            }),
        { isCommonLaw: input.isCommonLaw },
      )
    : expandSeedsForParticipants(
        seedFormsForProgram(input.programFamily as ProgramFamily, {
          applicationLocation: location,
          isCommonLaw: input.isCommonLaw,
          needsCustodian: input.needsCustodian,
        }),
        input.personIds,
      );
  const desiredKeys = new Set(
    desired.map((seed) => formRowKey(seed.formCode, seed.personId)),
  );

  const toDelete = rows.filter((row) => {
    if (OBSOLETE_PERMIT_FORMS.has(row.form_code)) return true;
    const key = formRowKey(row.form_code, row.person_id);
    if (desiredKeys.has(key)) return false;
    if (KIT_SWAP_FORMS.has(row.form_code)) return true;
    if (row.form_code === "imm5409") {
      return input.isCommonLaw === false && row.is_required;
    }
    if (row.form_code === "imm5646") {
      if (custom) return row.is_required;
      return input.needsCustodian === false && row.is_required;
    }
    return false;
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

  const remainingRows = rows.filter(
    (row) => !toDelete.some((d) => d.id === row.id),
  );
  const remainingKeys = new Set(
    remainingRows.map((row) => formRowKey(row.form_code, row.person_id)),
  );
  const remainingCountByPerson = new Map<string | null, number>();
  for (const row of remainingRows) {
    remainingCountByPerson.set(
      row.person_id,
      (remainingCountByPerson.get(row.person_id) ?? 0) + 1,
    );
  }
  const swappedPeople = new Set(
    toDelete
      .filter((row) => KIT_SWAP_FORMS.has(row.form_code))
      .map((row) => row.person_id),
  );

  const inserts = desired
    .filter((seed) => {
      const key = formRowKey(seed.formCode, seed.personId);
      if (remainingKeys.has(key)) return false;
      if ((remainingCountByPerson.get(seed.personId) ?? 0) === 0) return true;
      return (
        KIT_SWAP_FORMS.has(seed.formCode) && swappedPeople.has(seed.personId)
      );
    })
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
  needsCustodian: boolean;
} {
  const projectLoc = store.project.applicationLocation;
  const personBags = Object.values(store.byPerson);
  const personLoc = personBags.find((bag) => {
    const loc = String(bag.applicationLocation || "");
    return loc === "inside" || loc === "outside";
  })?.applicationLocation;
  const maritalStatus = personBags.find((bag) => bag.maritalStatus)?.maritalStatus;
  const inferred = inferApplicationLocationFromForms(existingFormCodes);

  return {
    applicationLocation: resolveApplicationLocation(
      projectLoc || inferred || personLoc,
      programFamily,
    ),
    isCommonLaw: detectCommonLaw({
      isCommonLaw: store.project.isCommonLaw,
      maritalStatus,
      participantRoles,
    }),
    needsCustodian:
      detectMinor({ needsCustodian: store.project.needsCustodian }) ||
      personBags.some((bag) =>
        detectMinor({
          needsCustodian: bag.needsCustodian,
          dob: bag.dob,
          dobYear: bag.dobYear,
          dobMonth: bag.dobMonth,
          dobDay: bag.dobDay,
        }),
      ),
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
  const rows = (data ?? []) as ProjectFormRow[];
  const people = await listActiveProjectPeople(supabase, projectId);
  return sortFormsPrincipalFirst(rows, people);
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
  if (!data) return null;
  const row = data as ProjectFormAnswersRow;
  const key = await getOrgDataKey(row.organization_id);
  return {
    ...row,
    answers: decryptAnswersValue(row.answers, key),
  };
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
      answers: encryptAnswersValue(
        input.answers,
        await getOrgDataKey(input.organizationId),
      ),
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

export async function removeProjectForm(input: {
  organizationId: string;
  projectId: string;
  formId: string;
}) {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("project_forms")
    .select("id")
    .eq("id", input.formId)
    .eq("project_id", input.projectId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!row) {
    throw new Error("not_found");
  }
  const { data: deleted, error } = await supabase
    .from("project_forms")
    .delete()
    .eq("id", input.formId)
    .eq("project_id", input.projectId)
    .eq("organization_id", input.organizationId)
    .select("id");
  if (error || !deleted?.length) {
    console.error("removeProjectForm:", error?.message ?? "no rows deleted");
    throw new Error(error?.message ?? "not_found");
  }
}

export async function getActiveShareLink(
  projectId: string,
): Promise<ActiveShareLink | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("form_share_links")
    .select("expires_at, token_encrypted")
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
  if (!data) return null;
  return {
    expires_at: data.expires_at as string,
    canReveal: Boolean(data.token_encrypted),
  };
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

  const { data: project, error: projectError } = await admin
    .from("immigration_projects")
    .select("status")
    .eq("id", data.project_id)
    .maybeSingle();

  if (projectError || !project || isGrantedStatus(project.status as string)) {
    return null;
  }

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

export async function loadShareGateContext(token: string) {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;

  const { getShareAccessState, toResolvedShareLink } = await import(
    "@/lib/ircc/share-auth"
  );
  const full = toResolvedShareLink(resolved, token);
  const access = await getShareAccessState(full);

  const admin = createServiceClient();
  const [projectRes, orgRes] = await Promise.all([
    admin
      .from("immigration_projects")
      .select("title, organization_id")
      .eq("id", resolved.projectId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", resolved.organizationId)
      .maybeSingle(),
  ]);

  if (!projectRes.data) return null;

  const key = await getOrgDataKey(resolved.organizationId);
  const project = decryptProjectRow(
    projectRes.data as { title: string; organization_id: string },
    key,
  );

  return {
    organizationId: resolved.organizationId,
    projectId: resolved.projectId,
    linkId: resolved.linkId,
    expiresAt: resolved.expiresAt,
    access,
    projectTitle: project.title,
    organizationName: String(orgRes.data?.name ?? ""),
  };
}

export async function loadShareContext(
  token: string,
  options?: { skipPasswordGate?: boolean },
) {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;

  if (!options?.skipPasswordGate) {
    const { assertShareAuthenticated } = await import("@/lib/ircc/share-auth");
    try {
      await assertShareAuthenticated(token);
    } catch {
      return null;
    }
  }

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
    return null;
  }

  if (!projectRes.data) return null;

  const project = decryptProjectRow(
    projectRes.data as {
      id: string;
      title: string;
      program_family: string;
      organization_id: string;
      form_language: string | null;
      representative_user_id: string | null;
    },
    await getOrgDataKey(resolved.organizationId),
  );
  const principal = people.find((p) => p.role === "principal") ?? people[0];
  const forms = sortFormsPrincipalFirst(
    (formsRes.data ?? []) as ProjectFormRow[],
    people,
  );
  const store = normalizeAnswersStore(
    decryptAnswersValue(
      answersRes.data?.answers,
      await getOrgDataKey(resolved.organizationId),
    ),
    {
      principalPersonId: principal?.id,
    },
  );

  const repUserId = project.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await admin
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const peopleWithAnswers = people.map((person) => {
    const formCodes = forms
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
    forms,
    answersStore: store,
    people: peopleWithAnswers,
    currentSection:
      (answersRes.data?.current_section as string | null) ?? null,
    questionnaireSubmittedAt:
      (answersRes.data?.questionnaire_submitted_at as string | null) ?? null,
    organization: orgRes.data,
  };
}

export async function saveShareAnswers(input: {
  token: string;
  personId: string;
  answers: Record<string, unknown>;
  currentSection?: string | null;
}) {
  const { assertShareAuthenticated } = await import("@/lib/ircc/share-auth");
  let resolved;
  try {
    resolved = await assertShareAuthenticated(input.token);
  } catch (err) {
    if (err instanceof Error && err.message === "auth_required") {
      throw new Error("auth_required");
    }
    throw new Error("expired");
  }
  const admin = createServiceClient();
  const people = await listActiveProjectPeople(admin, resolved.projectId);
  const person = people.find((p) => p.id === input.personId);
  if (!person) throw new Error("invalid_person");

  const { data: project } = await admin
    .from("immigration_projects")
    .select("form_language, representative_user_id, program_family, status")
    .eq("id", resolved.projectId)
    .maybeSingle();

  if (isGrantedStatus(project?.status as string | undefined)) {
    throw new Error("granted");
  }

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
  let store = normalizeAnswersStore(
    decryptAnswersValue(
      answersRow?.answers,
      await getOrgDataKey(resolved.organizationId),
    ),
    {
      principalPersonId: principal?.id,
    },
  );

  const cleaned = withProjectFormLanguage(
    mergeAccountRepIntoAnswers(
      injectPersonContact(input.answers, person),
      repProfile,
    ),
    project?.form_language,
  );
  cleaned.hasRepresentative = "Y";
  delete cleaned.applicationLocation;

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
      answers: encryptAnswersValue(
        store,
        await getOrgDataKey(resolved.organizationId),
      ),
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
    needsCustodian: kit.needsCustodian,
    personKits: personKitAssignments(
      people.map((p) => p.id),
      personKitsFromAnswersStore(store),
    ),
    client: admin,
  });
}

export async function submitShareQuestionnaire(input: {
  token: string;
  personId?: string;
  answers?: Record<string, unknown>;
  currentSection?: string | null;
}): Promise<{ submittedAt: string }> {
  if (input.personId && input.answers) {
    await saveShareAnswers({
      token: input.token,
      personId: input.personId,
      answers: input.answers,
      currentSection: input.currentSection,
    });
  }

  const ctx = await loadShareContext(input.token);
  if (!ctx) throw new Error("expired");

  const incomplete = ctx.people.filter((person) => {
    const { filled, total } = questionnaireFillCounts(
      person.formCodes,
      person.answers,
    );
    if (total === 0) return false;
    return filled < total;
  });
  if (incomplete.length > 0) {
    throw new Error("incomplete");
  }

  const admin = createServiceClient();
  const submittedAt = new Date().toISOString();
  const { error, data } = await admin
    .from("project_form_answers")
    .update({
      questionnaire_submitted_at: submittedAt,
      updated_at: submittedAt,
    })
    .eq("project_id", ctx.projectId)
    .eq("organization_id", ctx.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error(
      "submitShareQuestionnaire:",
      error?.message ?? "no answers row",
    );
    throw new Error("submit_failed");
  }

  const { notifyFormsSubmitted } = await import("@/lib/notifications/emit");
  await notifyFormsSubmitted({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
  });

  return { submittedAt };
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
  personKits?: Record<string, StoredPersonKit>;
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
  if (input.personKits && Object.keys(input.personKits).length > 0) {
    store.project.personKits = input.personKits;
  }
  return store;
}

export {
  emptyAnswersStore,
  mergePersonQuestionnaireSave,
  normalizeAnswersStore,
};
