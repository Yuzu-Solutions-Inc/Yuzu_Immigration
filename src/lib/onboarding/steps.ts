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
