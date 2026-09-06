export const ONBOARDING_CHECK_IDS = [
  "account",
  "representative",
  "signature",
  "hours",
  "calendar",
  "meeting",
  "service",
] as const;

export type OnboardingCheckId = (typeof ONBOARDING_CHECK_IDS)[number];

export const WIZARD_STEP_IDS = [
  "tour",
  "profile",
  "representative",
  "hours",
  "calendar",
  "meeting",
  "service",
  "payments",
  "team",
  "done",
] as const;

export type WizardStepId = (typeof WIZARD_STEP_IDS)[number];

export type OnboardingChecks = Record<OnboardingCheckId, boolean>;

/** OAuth connections that may be skipped and still count as done. */
export const INTEGRATION_CHECK_IDS = ["calendar", "meeting"] as const;

export type IntegrationCheckId = (typeof INTEGRATION_CHECK_IDS)[number];

export function isIntegrationCheckId(
  value: string,
): value is IntegrationCheckId {
  return (INTEGRATION_CHECK_IDS as readonly string[]).includes(value);
}

export const EMPTY_ONBOARDING_CHECKS: OnboardingChecks = {
  account: false,
  representative: false,
  signature: false,
  hours: false,
  calendar: false,
  meeting: false,
  service: false,
};

export function wizardStepsForRole(isAdmin: boolean): WizardStepId[] {
  if (isAdmin) return [...WIZARD_STEP_IDS];
  return WIZARD_STEP_IDS.filter(
    (id) => id !== "service" && id !== "payments" && id !== "team",
  );
}

export function emptyOnboardingChecks(): OnboardingChecks {
  return { ...EMPTY_ONBOARDING_CHECKS };
}

/** Setup tasks that apply for the workspace modules and this member's permissions. */
export function setupCheckIdsFor(input: {
  enabledModules: readonly string[]
  isAdmin: boolean
  canManageServices: boolean
}): OnboardingCheckId[] {
  const enabled = new Set(input.enabledModules);
  const ids: OnboardingCheckId[] = ["account"];
  if (enabled.has("immigration")) ids.push("representative");
  if (enabled.has("contracts")) ids.push("signature");
  if (enabled.has("bookings")) {
    ids.push("hours", "calendar", "meeting");
  }
  if (input.canManageServices && enabled.has("services")) {
    ids.push("service");
  }
  return ids;
}
