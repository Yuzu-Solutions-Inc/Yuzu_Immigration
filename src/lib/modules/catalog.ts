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
      { href: "/partners", navKey: "partners" },
      { href: "/billing/projects", navKey: "engagements" },
    ],
  },
  immigration: {
    id: "immigration",
    nameKey: "immigration",
    dependsOn: [],
    nav: [
      { href: "/projects", navKey: "projects" },
      { href: "/clients", navKey: "people" },
    ],
  },
  bookings: {
    id: "bookings",
    nameKey: "bookings",
    dependsOn: [],
    nav: [
      { href: "/calendar", navKey: "calendar" },
      { href: "/bookings", navKey: "bookings" },
    ],
  },
  services: {
    id: "services",
    nameKey: "services",
    dependsOn: [],
    nav: [{ href: "/services", navKey: "services" }],
  },
  contracts: {
    id: "contracts",
    nameKey: "contracts",
    dependsOn: [],
    nav: [],
  },
  payments: {
    id: "payments",
    nameKey: "payments",
    dependsOn: [],
    nav: [],
  },
};

/** Current Dossierly product when no rows exist yet (table missing or empty). */
export const FALLBACK_MODULES: ModuleId[] = [
  "immigration",
  "bookings",
  "services",
  "contracts",
  "payments",
];

export const ONBOARDING_DEFAULT_MODULES: ModuleId[] = [...FALLBACK_MODULES];

export function isModuleId(value: unknown): value is ModuleId {
  return (
    typeof value === "string" &&
    (MODULE_IDS as readonly string[]).includes(value)
  );
}

export function parseModuleIds(values: unknown[]): ModuleId[] {
  return [...new Set(values.filter(isModuleId))];
}

export function validateModuleSelection(selected: ModuleId[]): string | null {
  const set = new Set(selected);
  for (const id of selected) {
    for (const dep of MODULE_CATALOG[id].dependsOn) {
      if (!set.has(dep)) return "missing_dependency";
    }
  }
  if (set.has("payments") && !set.has("bookings") && !set.has("finance")) {
    return "payments_needs_charge_source";
  }
  return null;
}
