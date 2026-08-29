export type FlatCustomAnswers = Record<string, unknown>;

export type CustomAnswersStore = {
  byPerson: Record<string, FlatCustomAnswers>;
  project: FlatCustomAnswers;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function emptyCustomAnswersStore(): CustomAnswersStore {
  return { byPerson: {}, project: {} };
}

export function isCustomAnswersStore(
  raw: unknown,
): raw is CustomAnswersStore {
  return isPlainObject(raw) && isPlainObject(raw.byPerson);
}

export function normalizeCustomAnswersStore(
  raw: unknown,
  options?: { principalPersonId?: string | null },
): CustomAnswersStore {
  if (isCustomAnswersStore(raw)) {
    return {
      byPerson: { ...raw.byPerson },
      project: isPlainObject(raw.project) ? { ...raw.project } : {},
    };
  }
  if (isPlainObject(raw) && Object.keys(raw).length > 0) {
    const principal = options?.principalPersonId;
    if (principal) {
      return { byPerson: { [principal]: { ...raw } }, project: {} };
    }
  }
  return emptyCustomAnswersStore();
}

export function answersForCustomFill(
  store: CustomAnswersStore,
  personId: string | null,
): FlatCustomAnswers {
  const personBag = personId ? (store.byPerson[personId] ?? {}) : {};
  return { ...store.project, ...personBag };
}

export function mergeCustomPersonAnswers(
  store: CustomAnswersStore,
  personId: string,
  answers: FlatCustomAnswers,
  projectKeys: Set<string>,
): CustomAnswersStore {
  const nextPerson: FlatCustomAnswers = {};
  const nextProject: FlatCustomAnswers = { ...store.project };
  for (const [key, value] of Object.entries(answers)) {
    if (projectKeys.has(key)) nextProject[key] = value;
    else nextPerson[key] = value;
  }
  return {
    byPerson: { ...store.byPerson, [personId]: nextPerson },
    project: nextProject,
  };
}

export function mergeCustomProjectAnswers(
  store: CustomAnswersStore,
  answers: FlatCustomAnswers,
): CustomAnswersStore {
  return {
    byPerson: { ...store.byPerson },
    project: { ...store.project, ...answers },
  };
}

export function stripPersonFromCustomAnswersStore(
  store: CustomAnswersStore,
  personId: string,
): CustomAnswersStore {
  const byPerson = { ...store.byPerson };
  delete byPerson[personId];
  return { byPerson, project: { ...store.project } };
}

type CustomFormKeySource = {
  scope: string;
  schema: {
    sections: { fields: { key: string }[] }[];
  };
};

export function projectScopedKeysFromForms(
  forms: CustomFormKeySource[],
): Set<string> {
  const keys = new Set<string>();
  for (const form of forms) {
    if (form.scope !== "project") continue;
    for (const section of form.schema.sections) {
      for (const field of section.fields) keys.add(field.key);
    }
  }
  return keys;
}
