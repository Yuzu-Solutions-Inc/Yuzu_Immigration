import {
  getOnboardingState,
  type OnboardingCheckId,
} from "@/lib/onboarding/status";

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
  id: StaffSetupItemId;
  href: string;
};

export type StaffSetupChecklist = {
  done: number;
  total: number;
  items: StaffSetupItem[];
  showGuidedSetup: boolean;
};

export const EMPTY_STAFF_SETUP: StaffSetupChecklist = {
  done: 0,
  total: 0,
  items: [],
  showGuidedSetup: false,
};

const SETUP_HREFS: Record<StaffSetupItemId, string> = {
  account: "/settings/account",
  representative: "/settings/account#representative",
  signature: "/services?contracts=1",
  hours: "/settings/calendar#hours",
  calendar: "/settings/calendar#calendar",
  meeting: "/settings/calendar#meetings",
  service: "/services",
};

export async function getStaffSetupChecklist(
  _organizationId: string,
): Promise<StaffSetupChecklist> {
  const state = await getOnboardingState();
  if (!state) return EMPTY_STAFF_SETUP;
  if (state.wizardCompleted || state.wizardDismissed) {
    return EMPTY_STAFF_SETUP;
  }

  const ids: OnboardingCheckId[] = state.canManageServices
    ? [...STAFF_SETUP_ITEM_IDS]
    : STAFF_SETUP_ITEM_IDS.filter((id) => id !== "service");

  const rows = ids.map((id) => ({
    id,
    complete: state.checks[id],
    href: SETUP_HREFS[id],
  }));
  const done = rows.filter((row) => row.complete).length;

  return {
    done,
    total: rows.length,
    items: rows
      .filter((row) => !row.complete)
      .map((row) => ({ id: row.id, href: row.href })),
    showGuidedSetup: !state.wizardCompleted && !state.wizardDismissed,
  };
}
