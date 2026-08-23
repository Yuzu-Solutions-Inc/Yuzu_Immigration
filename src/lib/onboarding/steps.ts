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
