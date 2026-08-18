/**
 * Phase 1 recycle: copy safe keys from past non-destroyed files into a new
 * person's questionnaire bag. Application-purpose keys stay file-scoped.
 * Recycled values live only on the destination project_form_answers row.
 */

import {
  getPersonAnswers,
  normalizeAnswersStore,
  setPersonAnswers,
  type FlatAnswers,
  type ProjectAnswersStore,
} from "@/lib/ircc/answers-store";
import {
  CANONICAL_FIELDS,
  REPEATABLE_TABLES,
  fieldsForFormCodes,
  tablesForFormCodes,
} from "@/lib/ircc/fields";
import {
  RECYCLE_META_KEY,
  getRecycleMeta,
  type RecycleMeta,
} from "@/lib/ircc/recycle-meta";
import { decryptAnswersValue } from "@/lib/security/client-pii";

export {
  RECYCLE_META_KEY,
  getRecycleMeta,
  isRecycleMeta,
  type RecycleMeta,
} from "@/lib/ircc/recycle-meta";

export type RecycleClass =
  | "durable"
  | "current"
  | "history"
  | "attestation"
  | "application";

export type RecycleSource = {
  projectId: string;
  updatedAt: string;
  bag: FlatAnswers;
};

const HISTORY_TABLE_KEYS = new Set(REPEATABLE_TABLES.map((table) => table.key));

/** Inland entry facts live in section `work` but are not this file's purpose. */
const INLAND_ENTRY_KEYS = new Set([
  "origEntryDate",
  "origEntryPlace",
  "purposeOfVisit",
  "purposeOther",
  "recentEntryDate",
  "recentEntryPlace",
  "prevDocNum",
]);

const FILE_SCOPED_KEYS = new Set([
  "applicationLocation",
  "isCommonLaw",
  "needsCustodian",
  "personKits",
  "formLanguage",
  "hasRepresentative",
  "hasDesignee",
  "designeeFamilyName",
  "designeeGivenName",
  "designeeRelationship",
  "partnerFamilyName",
  "partnerGivenName",
  "yearsTogether",
  "commonLawCity",
  "commonLawProvince",
  "commonLawCountry",
  "commonLawStart",
]);

const IDENTITY_SEED_KEYS = new Set([
  "familyName",
  "givenName",
  "email",
  "formLanguage",
  "hasRepresentative",
]);

const FIELD_BY_KEY = new Map(CANONICAL_FIELDS.map((field) => [field.key, field]));
const TABLE_BY_KEY = new Map(REPEATABLE_TABLES.map((table) => [table.key, table]));

export function recycleClassification(key: string): RecycleClass {
  if (key === RECYCLE_META_KEY || key.startsWith("rep")) return "application";
  if (FILE_SCOPED_KEYS.has(key)) return "application";
  if (HISTORY_TABLE_KEYS.has(key) || key === "educationIndicator") return "history";
  if (INLAND_ENTRY_KEYS.has(key)) return "current";

  const section =
    FIELD_BY_KEY.get(key)?.section ?? TABLE_BY_KEY.get(key)?.section;
  switch (section) {
    case "study":
    case "visit":
    case "work":
      return "application";
    case "background":
      return "attestation";
    case "employment":
    case "education":
      return "history";
    case "contact":
    case "residence":
      return "current";
    case "identity":
      return key === "maritalStatus" ? "current" : "durable";
    case "passport":
    case "family":
      return "durable";
    default:
      return "application";
  }
}

export function isSafeRecycleClass(classification: RecycleClass): boolean {
  return classification !== "application";
}

export function isAnswerValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return value.some((row) => {
      if (!row || typeof row !== "object") return String(row ?? "").trim() !== "";
      return Object.values(row as Record<string, unknown>).some(isAnswerValuePresent);
    });
  }
  if (typeof value === "object") return Object.keys(value).length > 0;
  return String(value).trim() !== "";
}

export function isIdentitySeedOnly(bag: FlatAnswers | undefined): boolean {
  if (!bag) return true;
  for (const [key, value] of Object.entries(bag)) {
    if (key === RECYCLE_META_KEY || key.startsWith("rep")) continue;
    if (IDENTITY_SEED_KEYS.has(key)) continue;
    if (isAnswerValuePresent(value)) return false;
  }
  return true;
}

function allowedRecycleKeys(targetFormCodes: string[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fieldsForFormCodes(targetFormCodes)) {
    if (isSafeRecycleClass(recycleClassification(field.key))) {
      keys.add(field.key);
    }
  }
  for (const table of tablesForFormCodes(targetFormCodes)) {
    if (isSafeRecycleClass(recycleClassification(table.key))) {
      keys.add(table.key);
    }
  }
  return keys;
}

export function mergeLatestSafePersonAnswers(
  sources: RecycleSource[],
  targetFormCodes: string[],
): { bag: FlatAnswers; meta: RecycleMeta } | null {
  const allowed = allowedRecycleKeys(targetFormCodes);
  if (allowed.size === 0 || sources.length === 0) return null;

  const ordered = [...sources].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  const bag: FlatAnswers = {};
  const projectIds: string[] = [];
  const keys: string[] = [];
  const seenProjects = new Set<string>();

  for (const key of allowed) {
    const classification = recycleClassification(key);
    if (!isSafeRecycleClass(classification)) continue;

    for (const source of ordered) {
      const value = source.bag[key];
      if (!isAnswerValuePresent(value)) continue;
      bag[key] = value;
      keys.push(key);
      if (!seenProjects.has(source.projectId)) {
        seenProjects.add(source.projectId);
        projectIds.push(source.projectId);
      }
      break;
    }
  }

  if (keys.length === 0) return null;

  return {
    bag,
    meta: {
      importedAt: new Date().toISOString(),
      projectIds,
      keys,
    },
  };
}

export function applyRecycledPersonAnswers(input: {
  store: ProjectAnswersStore;
  personId: string;
  sources: RecycleSource[];
  targetFormCodes: string[];
}): ProjectAnswersStore {
  const existing = getPersonAnswers(input.store, input.personId);
  if (getRecycleMeta(existing)) return input.store;
  if (!isIdentitySeedOnly(existing)) return input.store;

  const merged = mergeLatestSafePersonAnswers(
    input.sources,
    input.targetFormCodes,
  );
  if (!merged) return input.store;

  return setPersonAnswers(input.store, input.personId, {
    ...existing,
    ...merged.bag,
    [RECYCLE_META_KEY]: merged.meta,
  });
}

export function formCodesByPersonFromSeeds(
  seeds: Array<{ formCode: string; personId: string | null }>,
  people: Array<{ id: string; role: string }>,
): Record<string, string[]> {
  const principalId =
    people.find((person) => person.role === "principal")?.id ?? people[0]?.id;
  const map: Record<string, string[]> = {};
  for (const person of people) map[person.id] = [];

  for (const seed of seeds) {
    const personId = seed.personId ?? principalId;
    if (!personId) continue;
    map[personId] ??= [];
    map[personId].push(seed.formCode);
  }
  return map;
}

export function formCodesByPersonFromRows(
  forms: Array<{ form_code: string; person_id: string | null }>,
  people: Array<{ id: string; role: string }>,
): Record<string, string[]> {
  return formCodesByPersonFromSeeds(
    forms.map((row) => ({
      formCode: row.form_code,
      personId: row.person_id,
    })),
    people,
  );
}

export async function recycleExistingPeopleIntoStore(input: {
  supabase: RecycleDb;
  organizationId: string;
  orgKey: Buffer;
  store: ProjectAnswersStore;
  people: Array<{ id: string; role: string }>;
  formCodesByPerson: Record<string, string[]>;
  excludeProjectId: string;
}): Promise<ProjectAnswersStore> {
  const sources = await loadPersonRecycleSources({
    supabase: input.supabase,
    organizationId: input.organizationId,
    personIds: input.people.map((person) => person.id),
    excludeProjectId: input.excludeProjectId,
    orgKey: input.orgKey,
  });

  let store = input.store;
  for (const person of input.people) {
    store = applyRecycledPersonAnswers({
      store,
      personId: person.id,
      sources: sources.get(person.id) ?? [],
      targetFormCodes: input.formCodesByPerson[person.id] ?? [],
    });
  }
  return store;
}

type RecycleDb = {
  // Minimal query surface; staff session client is passed from project actions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (relation: string) => any;
};

/**
 * Load each person's byPerson bags from non-destroyed files that still have
 * a project_form_answers row. Never reads tombstones or wiped answers.
 */
export async function loadPersonRecycleSources(input: {
  supabase: RecycleDb;
  organizationId: string;
  personIds: string[];
  excludeProjectId?: string | null;
  orgKey: Buffer;
}): Promise<Map<string, RecycleSource[]>> {
  const result = new Map<string, RecycleSource[]>();
  const personIds = [...new Set(input.personIds.filter(Boolean))];
  if (personIds.length === 0) return result;

  const { data: links, error: linksError } = await input.supabase
    .from("project_participants")
    .select("person_id, project_id")
    .eq("organization_id", input.organizationId)
    .in("person_id", personIds);

  if (linksError) {
    console.error("recycle sources participants:", linksError.message);
    return result;
  }

  const peopleByProject = new Map<string, string[]>();
  for (const row of (links ?? []) as Array<{
    person_id: string;
    project_id: string;
  }>) {
    if (row.project_id === input.excludeProjectId) continue;
    const list = peopleByProject.get(row.project_id) ?? [];
    list.push(row.person_id);
    peopleByProject.set(row.project_id, list);
  }

  const candidateIds = [...peopleByProject.keys()];
  if (candidateIds.length === 0) return result;

  const { data: liveProjects, error: projectsError } = await input.supabase
    .from("immigration_projects")
    .select("id")
    .eq("organization_id", input.organizationId)
    .in("id", candidateIds)
    .is("destroyed_at", null);

  if (projectsError) {
    console.error("recycle sources projects:", projectsError.message);
    return result;
  }

  const liveIds = ((liveProjects ?? []) as Array<{ id: string }>).map(
    (row) => row.id,
  );
  if (liveIds.length === 0) return result;

  const { data: answerRows, error: answersError } = await input.supabase
    .from("project_form_answers")
    .select("project_id, answers, updated_at")
    .eq("organization_id", input.organizationId)
    .in("project_id", liveIds);

  if (answersError) {
    console.error("recycle sources answers:", answersError.message);
    return result;
  }

  for (const row of (answerRows ?? []) as Array<{
    project_id: string;
    answers: unknown;
    updated_at: string | null;
  }>) {
    const personIdsOnFile = peopleByProject.get(row.project_id);
    if (!personIdsOnFile?.length) continue;

    const store = normalizeAnswersStore(
      decryptAnswersValue(row.answers, input.orgKey),
    );
    const updatedAt = row.updated_at || "1970-01-01T00:00:00.000Z";

    for (const personId of personIdsOnFile) {
      const bag = store.byPerson[personId];
      if (!bag) continue;
      const sources = result.get(personId) ?? [];
      sources.push({
        projectId: row.project_id,
        updatedAt,
        bag,
      });
      result.set(personId, sources);
    }
  }

  return result;
}
