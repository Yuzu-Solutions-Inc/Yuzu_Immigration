"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  INTEGRATION_CHECK_IDS,
  isIntegrationCheckId,
  type IntegrationCheckId,
} from "@/lib/onboarding/steps";
import { createClient } from "@/lib/supabase/server";

const localeSchema = z.enum(["en", "fr", "es"]);

type OnboardingRow = {
  organization_id: string;
  user_id: string;
  completed_at: string | null;
  dismissed_at: string | null;
  skipped_steps: string[];
  updated_at: string;
};

function uniqueSkipped(steps: string[]): IntegrationCheckId[] {
  return INTEGRATION_CHECK_IDS.filter((id) => steps.includes(id));
}

async function loadOnboardingRow() {
  const user = await getSessionUser();
  const membership = await getPrimaryMembership();
  if (!user || !membership) return { error: "unauthorized" as const };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_onboarding")
    .select("completed_at, dismissed_at, skipped_steps")
    .eq("organization_id", membership.organization.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("staff_onboarding load:", error.message);
    return { error: "save_failed" as const };
  }

  return {
    user,
    membership,
    supabase,
    current: data as {
      completed_at: string | null;
      dismissed_at: string | null;
      skipped_steps: string[] | null;
    } | null,
  };
}

async function saveOnboardingRow(
  row: OnboardingRow,
): Promise<{ ok: true } | { error: "save_failed" }> {
  const supabase = await createClient();
  const { error } = await supabase.from("staff_onboarding").upsert(row, {
    onConflict: "organization_id,user_id",
  });
  if (error) {
    console.error("staff_onboarding upsert:", error.message);
    return { error: "save_failed" };
  }
  return { ok: true };
}

async function upsertOnboarding(values: {
  completedAt?: string | null;
  dismissedAt?: string | null;
  extraSkipped?: IntegrationCheckId[];
}) {
  const loaded = await loadOnboardingRow();
  if ("error" in loaded) return loaded;

  const now = new Date().toISOString();
  const skipped = uniqueSkipped([
    ...(loaded.current?.skipped_steps ?? []),
    ...(values.extraSkipped ?? []),
  ]);

  const row: OnboardingRow = {
    organization_id: loaded.membership.organization.id,
    user_id: loaded.user.id,
    completed_at:
      values.completedAt !== undefined
        ? values.completedAt
        : (loaded.current?.completed_at ?? null),
    dismissed_at:
      values.dismissedAt !== undefined
        ? values.dismissedAt
        : (loaded.current?.dismissed_at ?? null),
    skipped_steps: skipped,
    updated_at: now,
  };

  return saveOnboardingRow(row);
}

export async function skipOnboardingIntegrationsAction(
  locale: string,
  steps: string[],
) {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return { error: "invalid" as const };
  const extraSkipped = steps.filter(isIntegrationCheckId);
  if (extraSkipped.length === 0) return { ok: true as const };
  const result = await upsertOnboarding({ extraSkipped });
  if ("error" in result) return result;
  revalidatePath(`/${parsed.data}/welcome`);
  revalidatePath(`/${parsed.data}/home`);
  return { ok: true as const };
}

export async function completeOnboardingAction(locale: string) {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return { error: "invalid" as const };
  const now = new Date().toISOString();
  const result = await upsertOnboarding({
    completedAt: now,
    dismissedAt: null,
    extraSkipped: [...INTEGRATION_CHECK_IDS],
  });
  if ("error" in result) return result;
  revalidatePath(`/${parsed.data}/welcome`);
  revalidatePath(`/${parsed.data}/home`);
  redirect(`/${parsed.data}/home`);
}

export async function dismissOnboardingAction(locale: string) {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return { error: "invalid" as const };
  const now = new Date().toISOString();
  const result = await upsertOnboarding({
    completedAt: now,
    dismissedAt: now,
    extraSkipped: [...INTEGRATION_CHECK_IDS],
  });
  if ("error" in result) return result;
  revalidatePath(`/${parsed.data}/welcome`);
  revalidatePath(`/${parsed.data}/home`);
  redirect(`/${parsed.data}/home`);
}
