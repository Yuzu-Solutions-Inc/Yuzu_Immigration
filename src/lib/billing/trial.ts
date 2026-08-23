import { canCreateRecords, type OrgAccessLevel } from "@/lib/auth/rbac";
import { PRICING } from "@/lib/marketing/pricing";

const DAY_MS = 86_400_000;

export const TRIAL_EMAIL_KINDS = {
  welcome: "trial-welcome",
  week1: "trial-week-1",
  week2: "trial-week-2",
  week3: "trial-week-3",
} as const;

export const TRIAL_EMAIL_OFFSET_DAYS = {
  welcome: 0,
  week1: 7,
  week2: 14,
  week3: 21,
} as const;

export function trialEndsAt(trialStartedAt: Date | string): Date {
  const start =
    typeof trialStartedAt === "string"
      ? new Date(trialStartedAt)
      : trialStartedAt;
  return new Date(start.getTime() + PRICING.trialDays * DAY_MS);
}

export function trialAgeDays(
  trialStartedAt: Date | string,
  now = new Date(),
): number {
  const start =
    typeof trialStartedAt === "string"
      ? new Date(trialStartedAt)
      : trialStartedAt;
  return Math.floor((now.getTime() - start.getTime()) / DAY_MS);
}

export function orgAllowsWrites(input: {
  trialStartedAt: Date | string;
  subscribedAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (input.subscribedAt) return true;
  const now = input.now ?? new Date();
  return now.getTime() < trialEndsAt(input.trialStartedAt).getTime();
}

export function canCreateInWorkspace(
  membership:
    | {
        role: OrgAccessLevel | null | undefined;
        organization: { writable: boolean };
      }
    | null
    | undefined,
): boolean {
  return Boolean(
    membership &&
      canCreateRecords(membership.role) &&
      membership.organization.writable,
  );
}

export function trialExpiredError(
  membership:
    | {
        organization: { writable: boolean };
      }
    | null
    | undefined,
): "trial_expired" | null {
  if (!membership || membership.organization.writable) return null;
  return "trial_expired";
}

export function isTrialExpiredDbError(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes("trial_expired"));
}
