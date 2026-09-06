/** Toggleable Dossierly product modules. Core (auth, partners, shell) is always on. */

export const MODULE_IDS = [
  "finance",
  "immigration",
  "bookings",
  "services",
  "contracts",
  "payments",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/** Bookings, services, and contracts share catalog, calendar, and e-sign. */
export const PRACTICE_MODULE_IDS = [
  "services",
  "bookings",
  "contracts",
] as const satisfies readonly ModuleId[];

export type PracticeModuleId = (typeof PRACTICE_MODULE_IDS)[number];

export type ModuleManifest = {
  id: ModuleId;
  /** i18n key under `modules.items` */
  nameKey: ModuleId;
  /** Other modules that must be on if this one is on. */
  dependsOn: ModuleId[];
  /** If payments: need bookings and/or finance (handled in validateModuleSelection). */
  nav: { href: string; navKey: string }[];
};

export const MODULE_CATALOG: Record<ModuleId, ModuleManifest> = {
  finance: {
    id: "finance",
    nameKey: "finance",
    dependsOn: [],
    nav: [
      { href: "/engagements", navKey: "engagements" },
      { href: "/bank", navKey: "bank" },
      { href: "/compensation/payroll", navKey: "compensation" },
      { href: "/other", navKey: "other" },
    ],
  },
  immigration: {
    id: "immigration",
    nameKey: "immigration",
    dependsOn: [],
    nav: [{ href: "/files", navKey: "files" }],
  },
  bookings: {
    id: "bookings",
    nameKey: "bookings",
    dependsOn: ["services", "contracts"],
    nav: [
      { href: "/calendar", navKey: "calendar" },
      { href: "/bookings", navKey: "bookings" },
    ],
  },
  services: {
    id: "services",
    nameKey: "services",
    dependsOn: ["bookings", "contracts"],
    nav: [{ href: "/services", navKey: "services" }],
  },
  contracts: {
    id: "contracts",
    nameKey: "contracts",
    dependsOn: ["services", "bookings"],
    nav: [],
  },
  payments: {
    id: "payments",
    nameKey: "payments",
    dependsOn: [],
    nav: [],
  },
};

/** No product modules until Settings or onboarding writes `organization_modules`. */
export const ONBOARDING_DEFAULT_MODULES: ModuleId[] = [];

export function isModuleId(value: unknown): value is ModuleId {
  return (
    typeof value === "string" &&
    (MODULE_IDS as readonly string[]).includes(value)
  );
}

export function isPracticeModuleId(value: unknown): value is PracticeModuleId {
  return (
    typeof value === "string" &&
    (PRACTICE_MODULE_IDS as readonly string[]).includes(value)
  );
}

export function parseModuleIds(values: unknown[]): ModuleId[] {
  return [...new Set(values.filter(isModuleId))];
}

export function isPracticeBundleEnabled(
  selected: ReadonlyArray<ModuleId> | ReadonlySet<ModuleId>,
): boolean {
  for (const id of PRACTICE_MODULE_IDS) {
    let found = false;
    for (const value of selected) {
      if (value === id) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

export function hasAnyPracticeModule(
  selected: ReadonlyArray<ModuleId> | ReadonlySet<ModuleId>,
): boolean {
  for (const value of selected) {
    if (isPracticeModuleId(value)) return true;
  }
  return false;
}

/** Expand the practice bundle so services, bookings, and contracts stay in sync. */
export function normalizeModuleSelection(
  ids: ReadonlyArray<unknown>,
): ModuleId[] {
  const set = new Set(parseModuleIds([...ids]));
  if (hasAnyPracticeModule(set)) {
    for (const id of PRACTICE_MODULE_IDS) set.add(id);
  }
  return MODULE_IDS.filter((id) => set.has(id));
}

export function togglePracticeBundle(
  selected: ReadonlySet<ModuleId>,
  on: boolean,
): Set<ModuleId> {
  const next = new Set(selected);
  for (const id of PRACTICE_MODULE_IDS) {
    if (on) next.add(id);
    else next.delete(id);
  }
  if (!on && !next.has("finance")) {
    next.delete("payments");
  }
  return next;
}

export function validateModuleSelection(selected: ModuleId[]): string | null {
  const set = new Set(normalizeModuleSelection(selected));
  for (const id of set) {
    for (const dep of MODULE_CATALOG[id].dependsOn) {
      if (!set.has(dep)) return "missing_dependency";
    }
  }
  if (set.has("payments") && !set.has("bookings") && !set.has("finance")) {
    return "payments_needs_charge_source";
  }
  return null;
}
