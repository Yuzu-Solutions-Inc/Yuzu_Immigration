/**
 * Ask-once answers are stored in one `project_form_answers` row per project.
 * Person-scoped fields live under `byPerson[personId]`; project-scoped
 * companions (e.g. IMM 5409) under `project`.
 */

export type FlatAnswers = Record<string, unknown>;

export type ProjectAnswersStore = {
  byPerson: Record<string, FlatAnswers>;
  project: FlatAnswers;
};

const IDENTITY_KEYS = [
  "familyName",
  "givenName",
  "sex",
  "dob",
  "placeBirthCity",
  "placeBirthCountry",
  "citizenship",
  "maritalStatus",
  "email",
  "phone",
  "phoneCountryCode",
  "streetNum",
  "streetName",
  "city",
  "provinceState",
  "country",
  "postalCode",
  "parent1FamilyName",
  "parent1GivenName",
  "parent2FamilyName",
  "parent2GivenName",
  "spouseFamilyName",
  "spouseGivenName",
  "hasDesignee",
  "designeeFamilyName",
  "designeeGivenName",
  "designeeRelationship",
  "needsCustodian",
  "schoolName",
  "schoolAddress",
  "applicationLocation",
  "employerName",
  "jobTitle",
  "jobDescription",
  "occupation",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Detect legacy flat bags (pre person-scoping) vs nested store. */
export function isAnswersStore(raw: unknown): raw is ProjectAnswersStore {
  if (!isPlainObject(raw)) return false;
  return isPlainObject(raw.byPerson);
}

export function emptyAnswersStore(): ProjectAnswersStore {
  return { byPerson: {}, project: {} };
}

/**
 * Normalize DB jsonb into a store. Legacy flat rows become the principal's bag
 * (or a synthetic stash under `__legacy__` if no principal id is known).
 */
export function normalizeAnswersStore(
  raw: unknown,
  options?: { principalPersonId?: string | null },
): ProjectAnswersStore {
  if (isAnswersStore(raw)) {
    return {
      byPerson: { ...raw.byPerson },
      project: isPlainObject(raw.project) ? { ...raw.project } : {},
    };
  }

  const store = emptyAnswersStore();
  if (!isPlainObject(raw) || Object.keys(raw).length === 0) return store;

  const principalId = options?.principalPersonId ?? null;
  if (principalId) {
    store.byPerson[principalId] = { ...raw };
  } else {
    store.byPerson.__legacy__ = { ...raw };
  }

  // Couple / project companions that lived in the flat bag.
  for (const key of [
    "applicationLocation",
    "isCommonLaw",
    "needsCustodian",
    "partnerFamilyName",
    "partnerGivenName",
    "yearsTogether",
    "commonLawCity",
    "commonLawProvince",
    "commonLawCountry",
    "commonLawStart",
  ] as const) {
    if (key in raw) store.project[key] = raw[key];
  }

  return store;
}

export function getPersonAnswers(
  store: ProjectAnswersStore,
  personId: string,
): FlatAnswers {
  return { ...(store.byPerson[personId] ?? {}) };
}

export function getProjectAnswers(store: ProjectAnswersStore): FlatAnswers {
  return { ...store.project };
}

/** Answers used to fill one form instance for a person (person + shared project). */
export function answersForPersonFill(
  store: ProjectAnswersStore,
  personId: string | null,
): FlatAnswers {
  if (!personId) {
    // Project-scoped forms: prefer principal bag if present, else first person.
    const firstPersonId = Object.keys(store.byPerson)[0];
    const personBag = firstPersonId
      ? getPersonAnswers(store, firstPersonId)
      : {};
    return { ...personBag, ...getProjectAnswers(store) };
  }
  return {
    ...getPersonAnswers(store, personId),
    ...getProjectAnswers(store),
  };
}

export function setPersonAnswers(
  store: ProjectAnswersStore,
  personId: string,
  answers: FlatAnswers,
): ProjectAnswersStore {
  return {
    ...store,
    byPerson: {
      ...store.byPerson,
      [personId]: { ...answers },
    },
  };
}

/** Drop one person’s bag so erasure does not leave their answers on a shared file. */
export function stripPersonFromAnswersStore(
  store: ProjectAnswersStore,
  personId: string,
): ProjectAnswersStore {
  if (!(personId in store.byPerson)) return store;
  const { [personId]: _removed, ...byPerson } = store.byPerson;
  return { ...store, byPerson };
}

export function setProjectScopedAnswers(
  store: ProjectAnswersStore,
  answers: FlatAnswers,
): ProjectAnswersStore {
  return {
    ...store,
    project: { ...store.project, ...answers },
  };
}

/** Merge questionnaire save for one person; peel project-only keys into `project`. */
export function mergePersonQuestionnaireSave(
  store: ProjectAnswersStore,
  personId: string,
  answers: FlatAnswers,
  projectScopedKeys: string[],
): ProjectAnswersStore {
  const personBag: FlatAnswers = {};
  const projectBag: FlatAnswers = { ...store.project };

  for (const [key, value] of Object.entries(answers)) {
    if (projectScopedKeys.includes(key)) {
      projectBag[key] = value;
    } else {
      personBag[key] = value;
    }
  }

  const previous = store.byPerson[personId] ?? {};
  for (const [key, value] of Object.entries(previous)) {
    if (key.startsWith("_") && !(key in personBag)) {
      personBag[key] = value;
    }
  }

  return {
    byPerson: {
      ...store.byPerson,
      [personId]: personBag,
    },
    project: projectBag,
  };
}

export function seedPersonIdentityFromName(
  displayName: string,
  email?: string | null,
): FlatAnswers {
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    familyName:
      nameParts.length > 1 ? nameParts.at(-1) : nameParts[0] || "",
    givenName:
      nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "",
    email: email || "",
  };
}

export function hasAnyPersonAnswers(store: ProjectAnswersStore): boolean {
  return Object.values(store.byPerson).some(
    (bag) => Object.keys(bag).length > 0,
  );
}

/** Keys that are clearly person identity (used when splitting legacy bags). */
export function isLikelyPersonAnswerKey(key: string): boolean {
  return (IDENTITY_KEYS as readonly string[]).includes(key) || key.startsWith("rep");
}
