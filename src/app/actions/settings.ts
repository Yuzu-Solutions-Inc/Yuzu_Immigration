"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser, getPrimaryMembership } from "@/lib/auth/session";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { requireOrganizationId } from "@/lib/crm/queries";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locales";
import { resolveCountryLic } from "@/lib/ircc/codes/resolve-lic";
import { slugifyOrganizationName } from "@/lib/org/slug";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";

function normalizeRepCountry(value: string): string {
  const raw = value.trim() || "Canada";
  try {
    return resolveCountryLic(raw);
  } catch {
    return raw;
  }
}

export type SettingsActionState = {
  error?: string;
  success?: boolean;
};

const localeEnum = z.enum(
  APP_LOCALES as unknown as [AppLocale, ...AppLocale[]],
);

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const accountSchema = z.object({
  locale: localeEnum,
  fullName: z.string().trim().min(1).max(120),
  repFamilyName: optionalText(80),
  repGivenName: optionalText(80),
  repOrganization: optionalText(120),
  repEmail: z.string().email().optional().or(z.literal("")),
  repPhone: optionalText(40),
  repPhoneCountryCode: optionalText(6),
  repMembershipId: optionalText(40),
  repStreetNum: optionalText(20),
  repStreetName: optionalText(80),
  repCity: optionalText(80),
  repProvince: optionalText(40),
  repCountry: optionalText(80),
  repPostalCode: optionalText(20),
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
  defaultLocale: localeEnum,
});

export async function updateAccountSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const empty = (key: string) => String(formData.get(key) ?? "").trim();
  const parsed = accountSchema.safeParse({
    locale: formData.get("locale") || "en",
    fullName: formData.get("fullName"),
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
    repCountry: normalizeRepCountry(empty("repCountry")),
    repPostalCode: empty("repPostalCode"),
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
    .eq("id", user.id);

  if (error) {
    console.error("update account:", error.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/settings/account`);

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
    defaultLocale: formData.get("defaultLocale") || "en",
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${parsed.data.locale}/onboarding`);
  }

  const membership = await getPrimaryMembership();
  if (!canAdministerOrg(membership?.role)) {
    return { error: "forbidden" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      default_locale: parsed.data.defaultLocale,
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

  const user = await getSessionUser();
  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "organization.update",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { name: parsed.data.name, slug: parsed.data.slug },
  });

  revalidatePath(`/${parsed.data.locale}/settings/organization`);
  revalidatePath(`/${parsed.data.defaultLocale}/settings/organization`);
  revalidatePath(`/${parsed.data.locale}/home`);
  if (parsed.data.defaultLocale !== parsed.data.locale) {
    redirect(`/${parsed.data.defaultLocale}/settings/organization`);
  }
  return { success: true };
}
