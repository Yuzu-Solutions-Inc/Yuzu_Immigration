import "server-only";

import { canAdministerOrg, canManageBookingCatalog } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getStaffBookingIntegrations } from "@/lib/booking/integrations";
import {
  getMyGoogleCalendarConnection,
  getMyMicrosoftCalendarConnection,
  getMyZoomConnection,
  listAvailabilityRules,
} from "@/lib/booking/queries";
import {
  isAccountNameComplete,
  isAccountRepComplete,
  PROFILE_REP_SELECT,
  type AccountRepSource,
} from "@/lib/ircc/account-rep";
import { type ModuleId } from "@/lib/modules/catalog";
import { type OnboardingChecks, setupCheckIdsFor } from "@/lib/onboarding/steps";
import { unseenModules } from "@/lib/onboarding/tour";
import { decryptProfileRow } from "@/lib/security/profile-pii";
import { createClient } from "@/lib/supabase/server";

export {
  EMPTY_ONBOARDING_CHECKS,
  ONBOARDING_CHECK_IDS,
  WIZARD_STEP_IDS,
  emptyOnboardingChecks,
  setupCheckIdsFor,
  wizardStepsForRole,
  type OnboardingCheckId,
  type OnboardingChecks,
  type WizardStepId,
} from "@/lib/onboarding/steps";

export type OnboardingState = {
  organizationId: string;
  isAdmin: boolean;
  canManageServices: boolean;
  canCreate: boolean;
  fullName: string;
  enabledModules: ModuleId[];
  seenModules: string[];
  unseenModules: ModuleId[];
  activeCheckIds: OnboardingCheckId[];
  checks: OnboardingChecks;
  wizardCompleted: boolean;
  wizardDismissed: boolean;
};

function connectionOn(row: { is_enabled?: boolean } | null | undefined) {
  return Boolean(row?.is_enabled);
}

export async function getOnboardingState(): Promise<OnboardingState | null> {
  const [user, membership] = await Promise.all([
    getSessionUser(),
    getPrimaryMembership(),
  ]);
  if (!user || !membership) return null;

  const orgId = membership.organization.id;
  const isAdmin = canAdministerOrg(membership.role);
  const canManageServices = canManageBookingCatalog(membership.role);
  const supabase = await createClient();

  const [
    profileResult,
    signatureResult,
    rules,
    integrations,
    google,
    microsoft,
    zoom,
    onboardingResult,
    servicesResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_REP_SELECT)
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("staff_contract_signatures")
      .select("signature_kind")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
    listAvailabilityRules(),
    getStaffBookingIntegrations(orgId, user.id),
    getMyGoogleCalendarConnection(),
    getMyMicrosoftCalendarConnection(),
    getMyZoomConnection(),
    supabase
      .from("staff_onboarding")
      .select("completed_at, dismissed_at, skipped_steps, seen_modules")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
    canManageServices
      ? supabase
          .from("booking_services")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("is_active", true)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (profileResult.error) {
    console.error("onboarding profile:", profileResult.error.message);
  }
  if (signatureResult.error) {
    console.error("onboarding signature:", signatureResult.error.message);
  }
  if (onboardingResult.error) {
    console.error("onboarding row:", onboardingResult.error.message);
  }
  if (servicesResult.error) {
    console.error("onboarding services:", servicesResult.error.message);
  }

  const profile = (profileResult.data ?? null) as AccountRepSource | null;
  const googleOk = connectionOn(google);
  const microsoftOk = connectionOn(microsoft);
  const zoomOk = connectionOn(zoom);
  const calendarOk =
    (integrations?.calendar_provider === "google" && googleOk) ||
    (integrations?.calendar_provider === "microsoft" && microsoftOk);
  const meetingOk =
    (integrations?.meeting_provider === "google_meet" && googleOk) ||
    (integrations?.meeting_provider === "teams" && microsoftOk) ||
    (integrations?.meeting_provider === "zoom" && zoomOk);

  const skippedRaw = onboardingResult.data?.skipped_steps;
  const skipped = new Set(
    (Array.isArray(skippedRaw) ? skippedRaw : []).filter(
      (step: unknown): step is string => typeof step === "string",
    ),
  );
  const kind = signatureResult.data?.signature_kind;
  const checks: OnboardingChecks = {
    account: isAccountNameComplete(profile),
    representative: isAccountRepComplete(profile),
    signature: kind === "typed" || kind === "drawn",
    hours: rules.length > 0,
    calendar: calendarOk || skipped.has("calendar"),
    meeting: meetingOk || skipped.has("meeting"),
    service: canManageServices ? (servicesResult.count ?? 0) > 0 : true,
  };

  const enabledModules = membership.enabledModules;
  const seenRaw = onboardingResult.data?.seen_modules;
  const seenModules = (Array.isArray(seenRaw) ? seenRaw : []).filter(
    (value: unknown): value is string => typeof value === "string",
  );
  const unseen = unseenModules(enabledModules, seenModules);
  const wizardCompleted = Boolean(onboardingResult.data?.completed_at);
  const wizardDismissed = Boolean(onboardingResult.data?.dismissed_at);

  return {
    organizationId: orgId,
    isAdmin,
    canManageServices,
    canCreate: canCreateInWorkspace(membership),
    fullName: String(decryptProfileRow(profile ?? {}).full_name ?? "").trim(),
    enabledModules,
    seenModules,
    unseenModules: wizardCompleted || wizardDismissed ? unseen : enabledModules,
    activeCheckIds: setupCheckIdsFor({
      enabledModules,
      isAdmin,
      canManageServices,
    }),
    checks,
    wizardCompleted,
    wizardDismissed,
  };
}
