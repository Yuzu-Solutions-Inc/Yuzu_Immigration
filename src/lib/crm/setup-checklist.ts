import { getSessionUser } from "@/lib/auth/session";
import { getStaffBookingIntegrations } from "@/lib/booking/integrations";
import {
  isAccountNameComplete,
  isAccountRepComplete,
  PROFILE_REP_SELECT,
  type AccountRepSource,
} from "@/lib/ircc/account-rep";
import { createClient } from "@/lib/supabase/server";

export const STAFF_SETUP_ITEM_IDS = [
  "account",
  "representative",
  "signature",
  "hours",
  "calendar",
  "meeting",
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
};

export const EMPTY_STAFF_SETUP: StaffSetupChecklist = {
  done: 0,
  total: 0,
  items: [],
};

const SETUP_HREFS: Record<StaffSetupItemId, string> = {
  account: "/settings/account",
  representative: "/settings/account#representative",
  signature: "/services?contracts=1",
  hours: "/settings/calendar#hours",
  calendar: "/settings/calendar#calendar",
  meeting: "/settings/calendar#meetings",
};

function connectionEnabled(row: { is_enabled?: boolean } | null | undefined) {
  return Boolean(row?.is_enabled);
}

export async function getStaffSetupChecklist(
  organizationId: string,
): Promise<StaffSetupChecklist> {
  const user = await getSessionUser();
  if (!user) return EMPTY_STAFF_SETUP;

  const supabase = await createClient();
  const [
    profileResult,
    signatureResult,
    hoursResult,
    integrations,
    googleResult,
    microsoftResult,
    zoomResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_REP_SELECT)
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("staff_contract_signatures")
      .select("signature_kind")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("booking_availability_rules")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("user_id", user.id),
    getStaffBookingIntegrations(organizationId, user.id),
    supabase
      .from("google_calendar_connections")
      .select("is_enabled")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("microsoft_calendar_connections")
      .select("is_enabled")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("zoom_connections")
      .select("is_enabled")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    console.error("setup checklist profile:", profileResult.error.message);
  }
  if (signatureResult.error) {
    console.error("setup checklist signature:", signatureResult.error.message);
  }
  if (hoursResult.error) {
    console.error("setup checklist hours:", hoursResult.error.message);
  }
  if (googleResult.error) {
    console.error("setup checklist google:", googleResult.error.message);
  }
  if (microsoftResult.error) {
    console.error("setup checklist microsoft:", microsoftResult.error.message);
  }
  if (zoomResult.error) {
    console.error("setup checklist zoom:", zoomResult.error.message);
  }

  const profile = (profileResult.data ?? null) as AccountRepSource | null;
  const googleOk = connectionEnabled(googleResult.data);
  const microsoftOk = connectionEnabled(microsoftResult.data);
  const zoomOk = connectionEnabled(zoomResult.data);
  const calendarOk =
    (integrations?.calendar_provider === "google" && googleOk) ||
    (integrations?.calendar_provider === "microsoft" && microsoftOk);
  const meetingOk =
    (integrations?.meeting_provider === "google_meet" && googleOk) ||
    (integrations?.meeting_provider === "teams" && microsoftOk) ||
    (integrations?.meeting_provider === "zoom" && zoomOk);

  const checks: { id: StaffSetupItemId; complete: boolean }[] = [
    { id: "account", complete: isAccountNameComplete(profile) },
    { id: "representative", complete: isAccountRepComplete(profile) },
    {
      id: "signature",
      complete:
        signatureResult.data?.signature_kind === "typed" ||
        signatureResult.data?.signature_kind === "drawn",
    },
    { id: "hours", complete: (hoursResult.count ?? 0) > 0 },
    { id: "calendar", complete: calendarOk },
    { id: "meeting", complete: meetingOk },
  ];

  const done = checks.filter((check) => check.complete).length;
  return {
    done,
    total: checks.length,
    items: checks
      .filter((check) => !check.complete)
      .map((check) => ({ id: check.id, href: SETUP_HREFS[check.id] })),
  };
}
