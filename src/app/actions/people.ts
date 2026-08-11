"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOrganizationId } from "@/lib/crm/queries";
import { personStatusAllowsExpiry } from "@/lib/crm/person-status";
import { createClient } from "@/lib/supabase/server";

const updatePersonSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  personId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  preferredLocale: z.enum(["en", "fr", "es"]),
  immigrationStatus: z.enum([
    "none",
    "visitor",
    "student",
    "worker",
    "maintained",
    "permanent_resident",
    "canadian_citizen",
    "refugee_claimant",
    "protected_person",
    "overstay",
    "other",
  ]),
  statusExpiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export type UpdatePersonState = {
  error?: string;
};

export async function updatePersonAction(
  _prev: UpdatePersonState,
  formData: FormData,
): Promise<UpdatePersonState> {
  const parsed = updatePersonSchema.safeParse({
    locale: formData.get("locale") || "en",
    personId: String(formData.get("personId") || ""),
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    preferredLocale: formData.get("preferredLocale") || "en",
    immigrationStatus: formData.get("immigrationStatus") || "none",
    statusExpiresAt: String(formData.get("statusExpiresAt") || ""),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const statusExpiresAt =
    personStatusAllowsExpiry(data.immigrationStatus) && data.statusExpiresAt
      ? data.statusExpiresAt
      : null;

  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", data.personId)
    .maybeSingle();

  if (existingError || !existing) {
    return { error: "not_found" };
  }

  const { error: updateError } = await supabase
    .from("people")
    .update({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      preferred_locale: data.preferredLocale,
      immigration_status: data.immigrationStatus,
      status_expires_at: statusExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.personId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("update person:", updateError.message);
    return { error: "update_failed" };
  }

  revalidatePath(`/${data.locale}/people/${data.personId}`);
  revalidatePath(`/${data.locale}/people`);
  revalidatePath(`/${data.locale}/home`);
  revalidatePath(`/${data.locale}/projects`);
  redirect(`/${data.locale}/people/${data.personId}`);
}
