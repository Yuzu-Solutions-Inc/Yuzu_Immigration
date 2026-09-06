"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  clearActiveOrganizationId,
  setActiveOrganizationId,
} from "@/lib/auth/active-org";
import { canDeleteOrganization } from "@/lib/auth/rbac";
import { getPrimaryMembership, getUserMemberships } from "@/lib/auth/session";
import {
  cancelOrganizationSubscription,
  deleteOrganizationStorage,
  loadOwnerContact,
} from "@/lib/org/delete-organization";
import { hasAcceptedLegal } from "@/lib/legal/acceptance";
import {
  FIRM_DPA_VERSION,
  firmDpaAcceptanceColumns,
  formAcceptedFirmDpa,
} from "@/lib/legal/dpa";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slugifyOrganizationName } from "@/lib/org/slug";
import { ONBOARDING_DEFAULT_MODULES, normalizeModuleSelection, validateModuleSelection } from "@/lib/modules/catalog";
import { replaceOrganizationModules } from "@/lib/modules/org-modules";
import { recordAuditEvent } from "@/lib/security/audit";
import { encryptOrgRow } from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(48)
    .optional(),
  privacyContactEmail: emailSchema,
  locale: z.enum(["en", "fr", "es"]).default("en"),
});

export type CreateOrgState = {
  error?: string;
};

export async function createOrganizationAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const name = String(formData.get("name") ?? "");
  const slugInput = String(formData.get("slug") ?? "").trim();
  const locale = (formData.get("locale") as string) || "en";

  const parsed = createOrgSchema.safeParse({
    name,
    slug: slugInput || slugifyOrganizationName(name) || undefined,
    privacyContactEmail: String(formData.get("privacyContactEmail") ?? ""),
    locale,
  });

  if (!parsed.success) {
    return { error: "invalid_org" };
  }

  if (!formAcceptedFirmDpa(formData)) {
    return { error: "dpa_required" };
  }

  const selectedModules = formData.get("modulesPresent")
    ? normalizeModuleSelection(formData.getAll("module"))
    : [...ONBOARDING_DEFAULT_MODULES];
  if (validateModuleSelection(selectedModules)) {
    return { error: "invalid_org" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  if (!hasAcceptedLegal(user)) {
    redirect(
      `/${locale}/legal/accept?next=${encodeURIComponent(`/${locale}/onboarding`)}`,
    );
  }

  // Privileged RPC is service_role-only; session already verified above.
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug ?? slugifyOrganizationName(parsed.data.name),
    p_actor_user_id: user.id,
  });

  if (error) {
    console.error("create_organization rpc:", error.message, error.code);
    if (
      error.message.toLowerCase().includes("duplicate") ||
      error.code === "23505"
    ) {
      return { error: "slug_taken" };
    }
    return { error: "create_failed" };
  }

  if (!data) {
    return { error: "create_failed" };
  }

  const org = data as { id?: string };
  if (org.id) {
    await setActiveOrganizationId(org.id);
    const { loadOrCreateOrgDataKey, getOrgDataKey } = await import(
      "@/lib/security/org-data-key"
    );
    const { encryptOrgRow } = await import("@/lib/security/encrypted-fields");
    await loadOrCreateOrgDataKey(org.id);
    const orgKey = await getOrgDataKey(org.id);
    const { error: orgUpdateError } = await admin
      .from("organizations")
      .update({
        default_locale: parsed.data.locale,
        ...encryptOrgRow(
          "organizations",
          { privacy_contact_email: parsed.data.privacyContactEmail },
          orgKey,
        ),
        ...firmDpaAcceptanceColumns(user.id),
      })
      .eq("id", org.id);
    if (orgUpdateError) {
      console.error("create_organization settings:", orgUpdateError.message);
      return { error: "create_failed" };
    }
    const moduleResult = await replaceOrganizationModules(
      admin,
      org.id,
      selectedModules,
    );
    if (moduleResult.error) {
      console.error("create_organization modules:", moduleResult.error);
    }
    after(() => {
      void import("@/lib/email/trial").then(({ sendTrialEmailsForOrg }) =>
        sendTrialEmailsForOrg(org.id as string, "welcome"),
      );
    });
  }
  await recordAuditEvent({
    organizationId: org.id ?? null,
    actorUserId: user.id,
    actorKind: "staff",
    action: "organization.create",
    resourceType: "organization",
    resourceId: org.id,
    metadata: { name: parsed.data.name, dpaVersion: FIRM_DPA_VERSION },
  });

  redirect(`/${locale}/welcome`);
}

export async function switchOrganizationAction(formData: FormData) {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      organizationId: z.string().uuid(),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      organizationId: String(formData.get("organizationId") || ""),
    });

  if (!parsed.success) {
    return;
  }

  const memberships = await getUserMemberships();
  const next = memberships.find(
    (row) => row.organization.id === parsed.data.organizationId,
  );
  if (!next) {
    return;
  }

  await setActiveOrganizationId(next.organization.id);
  revalidatePath("/", "layout");
  redirect(`/${next.organization.defaultLocale}/home`);
}

export type DeleteOrganizationState = {
  error?: string;
};

export async function deleteOrganizationAction(
  _prev: DeleteOrganizationState,
  formData: FormData,
): Promise<DeleteOrganizationState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      confirmName: z.string().trim().min(1).max(120),
      ciccBackup: z.literal("yes"),
      understood: z.literal("yes"),
      finalConfirm: z.literal("yes"),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      confirmName: String(formData.get("confirmName") || ""),
      ciccBackup: String(formData.get("ciccBackup") || ""),
      understood: String(formData.get("understood") || ""),
      finalConfirm: String(formData.get("finalConfirm") || ""),
    });

  if (!parsed.success) {
    return { error: "confirmations_required" };
  }

  const membership = await getPrimaryMembership();
  if (!membership || !canDeleteOrganization(membership.role)) {
    return { error: "forbidden" };
  }

  const orgId = membership.organization.id;
  const expectedName = membership.organization.name.trim().toLowerCase();
  if (parsed.data.confirmName.trim().toLowerCase() !== expectedName) {
    return { error: "name_mismatch" };
  }

  const admin = createServiceClient();
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) {
    redirect(`/${parsed.data.locale}/login`);
  }

  const contact = await loadOwnerContact(orgId);
  const orgKey = await getOrgDataKey(orgId);
  const sealedContact = encryptOrgRow(
    "organizations",
    {
      owner_contact_name: contact.name,
      owner_contact_email: contact.email,
    },
    orgKey,
  );
  await cancelOrganizationSubscription(orgId);
  await deleteOrganizationStorage(orgId);

  const { error } = await admin.rpc("purge_organization", {
    p_organization_id: orgId,
    p_actor_user_id: user.id,
    p_owner_contact_name: sealedContact.owner_contact_name,
    p_owner_contact_email: sealedContact.owner_contact_email,
  });

  if (error) {
    console.error("purge_organization:", error.message);
    return { error: "delete_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user.id,
    actorKind: "staff",
    action: "organization.delete",
    resourceType: "organization",
    resourceId: orgId,
  });

  const remaining = (await getUserMemberships()).filter(
    (row) => row.organization.id !== orgId,
  );
  if (remaining[0]) {
    await setActiveOrganizationId(remaining[0].organization.id);
  } else {
    await clearActiveOrganizationId();
  }
  revalidatePath("/", "layout");
  redirect(`/${parsed.data.locale}`);
}
