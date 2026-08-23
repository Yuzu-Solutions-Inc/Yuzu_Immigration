"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const localeSchema = z.enum(["en", "fr", "es"]);

async function upsertOnboarding(values: {
  completedAt?: string | null;
  dismissedAt?: string | null;
}) {
  const user = await getSessionUser();
  const membership = await getPrimaryMembership();
  if (!user || !membership) return { error: "unauthorized" as const };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("staff_onboarding").upsert(
    {
      organization_id: membership.organization.id,
      user_id: user.id,
      completed_at: values.completedAt,
      dismissed_at: values.dismissedAt,
      updated_at: now,
    },
    { onConflict: "organization_id,user_id" },
  );
  if (error) {
    console.error("staff_onboarding upsert:", error.message);
    return { error: "save_failed" as const };
  }
  return { ok: true as const };
}

export async function completeOnboardingAction(locale: string) {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return { error: "invalid" as const };
  const now = new Date().toISOString();
  const result = await upsertOnboarding({ completedAt: now, dismissedAt: null });
  if ("error" in result) return result;
  revalidatePath(`/${parsed.data}/welcome`);
  revalidatePath(`/${parsed.data}/home`);
  redirect(`/${parsed.data}/home`);
}

export async function dismissOnboardingAction(locale: string) {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return { error: "invalid" as const };
  const now = new Date().toISOString();
  const result = await upsertOnboarding({ dismissedAt: now });
  if ("error" in result) return result;
  revalidatePath(`/${parsed.data}/welcome`);
  revalidatePath(`/${parsed.data}/home`);
  redirect(`/${parsed.data}/home`);
}
