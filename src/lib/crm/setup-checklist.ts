import {
  getOnboardingState,
  type OnboardingCheckId,
} from "@/lib/onboarding/status";
import type { ModuleId } from "@/lib/modules/catalog";

export const STAFF_SETUP_ITEM_IDS = [
  "account",
  "representative",
  "signature",
  "hours",
  "calendar",
  "meeting",
  "service",
] as const;

export type StaffSetupItemId = (typeof STAFF_SETUP_ITEM_IDS)[number];

export type StaffSetupItem = {
  id: StaffSetupItemId
  href: string
};

export type StaffSetupChecklist = {
  done: number
  total: number
  items: StaffSetupItem[]
  showGuidedSetup: boolean
  /** Product modules added since this member last finished the tour. */
  unseenModules: ModuleId[]
  tourPending: boolean
};

export const EMPTY_STAFF_SETUP: StaffSetupChecklist = {
  done: 0,
  total: 0,
  items: [],
  showGuidedSetup: false,
  unseenModules: [],
  tourPending: false,
};

const SETUP_HREFS: Record<StaffSetupItemId, string> = {
  account: "/settings/account",
  representative: "/settings/account#representative",
  signature: "/services?contracts=1",
  hours: "/settings/account#hours",
  calendar: "/settings/account#calendar",
  meeting: "/settings/account#meetings",
  service: "/services",
};

export async function getStaffSetupChecklist(
  _organizationId: string,
): Promise<StaffSetupChecklist> {
  const state = await getOnboardingState();
  if (!state) return EMPTY_STAFF_SETUP;

  const ids = state.activeCheckIds;
  const rows = ids.map((id) => ({
    id,
    complete: state.checks[id],
    href: SETUP_HREFS[id],
  }));
  const done = rows.filter((row) => row.complete).length;
  const neverToured = !state.wizardCompleted && !state.wizardDismissed;
  const tourPending = neverToured || state.unseenModules.length > 0;

  return {
    done,
    total: rows.length,
    items: rows
      .filter((row) => !row.complete)
      .map((row) => ({ id: row.id, href: row.href })),
    showGuidedSetup: tourPending,
    unseenModules: neverToured ? [] : state.unseenModules,
    tourPending,
  };
}

export type { OnboardingCheckId };
