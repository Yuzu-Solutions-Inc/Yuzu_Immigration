"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser, getPrimaryMembership } from "@/lib/auth/session";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { trialExpiredError } from "@/lib/billing/trial";
import { requireOrganizationId } from "@/lib/crm/queries";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locales";
import { resolveCountryLic } from "@/lib/ircc/codes/resolve-lic";
import {
  missingAccountRepFormKeys,
  type AccountRepFormValues,
  type AccountRepRequiredFormKey,
} from "@/lib/ircc/account-rep";
import { slugifyOrganizationName } from "@/lib/org/slug";
import {
  FIRM_DPA_VERSION,
  firmDpaAcceptanceColumns,
  formAcceptedFirmDpa,
} from "@/lib/legal/dpa";
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

export type SettingsFieldError = "required" | "invalid";

export type SettingsActionState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, SettingsFieldError>;
  missingRepFields?: AccountRepRequiredFormKey[];
  repComplete?: boolean;
  repValues?: AccountRepFormValues;
};

const localeEnum = z.enum(
  APP_LOCALES as unknown as [AppLocale, ...AppLocale[]],
);

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

function zodFieldErrors(
  error: z.ZodError,
): Record<string, SettingsFieldError> {
  const fieldErrors: Record<string, SettingsFieldError> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || fieldErrors[key]) continue;
    fieldErrors[key] = issue.code === "too_small" ? "required" : "invalid";
  }
  return fieldErrors;
}

const accountProfileSchema = z.object({
  locale: localeEnum,
  fullName: z.string().trim().min(1).max(120),
});

const accountRepSchema = z.object({
  locale: localeEnum,
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
  privacyContactEmail: z.string().trim().toLowerCase().email().max(254),
  portalGoogleLoginEnabled: z.boolean(),
});

export async function updateAccountSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = accountProfileSchema.safeParse({
    locale: formData.get("locale") || "en",
    fullName: formData.get("fullName"),
  });

  if (!parsed.success) {
    return { error: "invalid", fieldErrors: zodFieldErrors(parsed.error) };
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("update account:", error.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/settings/account`);
  revalidatePath(`/${parsed.data.locale}/home`);
  revalidatePath(`/${parsed.data.locale}/welcome`);

  return { success: true };
}

export async function updateAccountRepAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const empty = (key: string) => String(formData.get(key) ?? "").trim();
  const parsed = accountRepSchema.safeParse({
    locale: formData.get("locale") || "en",
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
    const missingRepFields = missingAccountRepFormKeys({
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
    return {
      error: "invalid",
      fieldErrors: zodFieldErrors(parsed.error),
      missingRepFields: missingRepFields.length ? missingRepFields : undefined,
    };
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${parsed.data.locale}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
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
    console.error("update account representative:", error.message);
    return { error: "save_failed" };
  }

  const missingRepFields = missingAccountRepFormKeys(
    parsed.data,
    user.email,
  );
  const repComplete = missingRepFields.length === 0;
  const repValues: AccountRepFormValues = {
    repFamilyName: parsed.data.repFamilyName || "",
    repGivenName: parsed.data.repGivenName || "",
    repOrganization: parsed.data.repOrganization || "",
    repEmail: parsed.data.repEmail || "",
    repPhone: parsed.data.repPhone || "",
    repPhoneCountryCode: parsed.data.repPhoneCountryCode || "",
    repMembershipId: parsed.data.repMembershipId || "",
    repStreetNum: parsed.data.repStreetNum || "",
    repStreetName: parsed.data.repStreetName || "",
    repCity: parsed.data.repCity || "",
    repProvince: parsed.data.repProvince || "",
    repCountry: parsed.data.repCountry || "",
    repPostalCode: parsed.data.repPostalCode || "",
  };

  revalidatePath(`/${parsed.data.locale}/settings/account`);
  revalidatePath(`/${parsed.data.locale}/home`);
  revalidatePath(`/${parsed.data.locale}/welcome`);

  return {
    success: true,
    repComplete,
    repValues,
    missingRepFields: repComplete ? undefined : missingRepFields,
  };
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
    privacyContactEmail: formData.get("privacyContactEmail"),
    portalGoogleLoginEnabled:
      formData.get("portalGoogleLoginEnabled") === "on",
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
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      default_locale: parsed.data.defaultLocale,
      privacy_contact_email: parsed.data.privacyContactEmail,
      portal_google_login_enabled: parsed.data.portalGoogleLoginEnabled,
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

export async function acceptOrganizationDpaAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const locale = String(formData.get("locale") || "en");
  if (!formAcceptedFirmDpa(formData)) {
    return { error: "dpa_required" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${locale}/onboarding`);
  }

  const membership = await getPrimaryMembership();
  if (!canAdministerOrg(membership?.role)) {
    return { error: "forbidden" };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      ...firmDpaAcceptanceColumns(user.id),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) {
    console.error("accept organization dpa:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user.id,
    actorKind: "staff",
    action: "organization.dpa_accept",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { version: FIRM_DPA_VERSION },
  });

  revalidatePath(`/${locale}/settings/organization`);
  return { success: true };
}

const changePasswordSchema = z
  .object({
    locale: localeEnum,
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = changePasswordSchema.safeParse({
    locale: formData.get("locale") || "en",
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "password_mismatch") {
      return { error: "password_mismatch" };
    }
    return { error: "invalid" };
  }

  const user = await getSessionUser();
  if (!user?.email) {
    redirect(`/${parsed.data.locale}/login`);
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (verifyError) {
    return { error: "wrong_password" };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (updateError) {
    console.error("change password:", updateError.message);
    return { error: "password_update_failed" };
  }

  const membership = await getPrimaryMembership();
  await recordAuditEvent({
    organizationId: membership?.organization.id,
    actorUserId: user.id,
    actorKind: "staff",
    action: "account.password_change",
    resourceType: "profile",
    resourceId: user.id,
  });

  revalidatePath(`/${parsed.data.locale}/settings/account`);
  return { success: true };
}
