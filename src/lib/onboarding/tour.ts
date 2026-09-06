import type { ModuleId } from "@/lib/modules/catalog";

export type TourStepId =
  | "home"
  | "partners"
  | "partnersNew"
  | "projects"
  | "projectsNew"
  | "engagements"
  | "bank"
  | "calendar"
  | "services"
  | "settings"
  | "payments";

export type TourStep = {
  id: TourStepId
  /** Matches `data-tour` on the highlighted control. */
  target: string
  route: string
  /** `core` always. Otherwise the step is shown when any listed module is on. */
  modules: "core" | ModuleId[]
  adminOnly?: boolean
  /** Advance when the user clicks the highlighted control. */
  clickTarget?: boolean
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "home",
    target: "nav-home",
    route: "/home",
    modules: "core",
  },
  {
    id: "partners",
    target: "nav-partners",
    route: "/home",
    modules: "core",
    clickTarget: true,
  },
  {
    id: "partnersNew",
    target: "new-partner",
    route: "/partners",
    modules: "core",
  },
  {
    id: "projects",
    target: "nav-projects",
    route: "/home",
    modules: ["immigration"],
    clickTarget: true,
  },
  {
    id: "projectsNew",
    target: "new-project",
    route: "/projects",
    modules: ["immigration"],
  },
  {
    id: "engagements",
    target: "nav-engagements",
    route: "/home",
    modules: ["finance"],
    clickTarget: true,
  },
  {
    id: "bank",
    target: "nav-bank",
    route: "/home",
    modules: ["finance"],
  },
  {
    id: "calendar",
    target: "nav-calendar",
    route: "/home",
    modules: ["bookings"],
    clickTarget: true,
  },
  {
    id: "services",
    target: "nav-services",
    route: "/home",
    modules: ["services"],
  },
  {
    id: "settings",
    target: "nav-settings",
    route: "/home",
    modules: "core",
    clickTarget: true,
  },
  {
    id: "payments",
    target: "nav-payments",
    route: "/settings/payments",
    modules: ["payments"],
    adminOnly: true,
  },
];

export type TourFilter = {
  enabledModules: readonly ModuleId[]
  isAdmin: boolean
  canCreate: boolean
  /** When set, only steps for these modules (plus core if includeCore). */
  focusModules?: readonly ModuleId[]
  includeCore?: boolean
};

function stepVisible(
  step: TourStep,
  enabled: ReadonlySet<ModuleId>,
  filter: TourFilter,
): boolean {
  if (step.adminOnly && !filter.isAdmin) return false;
  if (step.id === "partnersNew" && !filter.canCreate) return false;
  if (step.id === "projectsNew" && !filter.canCreate) return false;

  if (step.modules === "core") {
    return filter.includeCore !== false;
  }
  return step.modules.some((id) => enabled.has(id));
}

export function tourStepsFor(filter: TourFilter): TourStep[] {
  const enabled = new Set(filter.enabledModules);
  const focus = filter.focusModules
    ? new Set(filter.focusModules)
    : null;
  const includeCore = focus ? Boolean(filter.includeCore) : filter.includeCore !== false;

  return TOUR_STEPS.filter((step) => {
    if (!stepVisible(step, enabled, { ...filter, includeCore })) return false;
    if (!focus) return true;
    if (step.modules === "core") return includeCore;
    return step.modules.some((id) => focus.has(id));
  });
}

export function unseenModules(
  enabled: readonly ModuleId[],
  seen: readonly string[],
): ModuleId[] {
  const seenSet = new Set(seen);
  return enabled.filter((id) => !seenSet.has(id));
}
