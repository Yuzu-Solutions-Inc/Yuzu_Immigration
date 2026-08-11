"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/crm/queries";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locales";
import { slugifyOrganizationName } from "@/lib/org/slug";
import { createClient } from "@/lib/supabase/server";

export type SettingsActionState = {
  error?: string;
  success?: boolean;
};

const localeEnum = z.enum(
  APP_LOCALES as unknown as [AppLocale, ...AppLocale[]],
);

const accountSchema = z.object({
  locale: localeEnum,
  fullName: z.string().trim().min(1).max(120),
  preferredLocale: localeEnum,
});

const orgSchema = z.object({
  locale: localeEnum,
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(48),
  repFamilyName: z.string().trim().max(80).optional().or(z.literal("")),
  repGivenName: z.string().trim().max(80).optional().or(z.literal("")),
  repOrganization: z.string().trim().max(120).optional().or(z.literal("")),
  repEmail: z.string().email().optional().or(z.literal("")),
  repPhone: z.string().trim().max(40).optional().or(z.literal("")),
  repPhoneCountryCode: z.string().trim().max(6).optional().or(z.literal("")),
  repMembershipId: z.string().trim().max(40).optional().or(z.literal("")),
  repStreetNum: z.string().trim().max(20).optional().or(z.literal("")),
  repStreetName: z.string().trim().max(80).optional().or(z.literal("")),
  repCity: z.string().trim().max(80).optional().or(z.literal("")),
  repProvince: z.string().trim().max(40).optional().or(z.literal("")),
  repCountry: z.string().trim().max(80).optional().or(z.literal("")),
  repPostalCode: z.string().trim().max(20).optional().or(z.literal("")),
});

export async function updateAccountSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = accountSchema.safeParse({
    locale: formData.get("locale") || "en",
    fullName: formData.get("fullName"),
    preferredLocale: formData.get("preferredLocale") || "en",
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${parsed.data.locale}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      preferred_locale: parsed.data.preferredLocale,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("update account:", error.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/settings/account`);
  revalidatePath(`/${parsed.data.preferredLocale}/settings/account`);

  if (parsed.data.preferredLocale !== parsed.data.locale) {
    redirect(`/${parsed.data.preferredLocale}/settings/account`);
  }

  return { success: true };
}

export async function updateOrganizationSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const empty = (key: string) => String(formData.get(key) ?? "").trim();
  const parsed = orgSchema.safeParse({
    locale: formData.get("locale") || "en",
    name: formData.get("name"),
    slug: formData.get("slug") || slugifyOrganizationName(empty("name")),
    repFamilyName: empty("repFamilyName"),
    repGivenName: empty("repGivenName"),
    repOrganization: empty("repOrganization"),
    repEmail: empty("repEmail"),
    repPhone: empty("repPhone"),
    repPhoneCountryCode: empty("repPhoneCountryCode"),
    repMembershipId: empty("repMembershipId"),
    repStreetNum: empty("repStreetNum"),
    repStreetName: empty("repStreetName"),
    repCity: empty("repCity"),
    repProvince: empty("repProvince"),
    repCountry: empty("repCountry") || "Canada",
    repPostalCode: empty("repPostalCode"),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${parsed.data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      rep_family_name: parsed.data.repFamilyName || null,
      rep_given_name: parsed.data.repGivenName || null,
      rep_organization: parsed.data.repOrganization || null,
      rep_email: parsed.data.repEmail || null,
      rep_phone: parsed.data.repPhone || null,
      rep_phone_country_code: parsed.data.repPhoneCountryCode || null,
      rep_membership_id: parsed.data.repMembershipId || null,
      rep_street_num: parsed.data.repStreetNum || null,
      rep_street_name: parsed.data.repStreetName || null,
      rep_city: parsed.data.repCity || null,
      rep_province: parsed.data.repProvince || null,
      rep_country: parsed.data.repCountry || null,
      rep_postal_code: parsed.data.repPostalCode || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) {
    console.error("update organization:", error.message);
    if (
      error.message.toLowerCase().includes("duplicate") ||
      error.code === "23505"
    ) {
      return { error: "slug_taken" };
    }
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/settings/organization`);
  revalidatePath(`/${parsed.data.locale}/home`);
  return { success: true };
}
