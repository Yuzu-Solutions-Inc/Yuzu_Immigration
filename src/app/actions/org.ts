"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setActiveOrganizationId } from "@/lib/auth/active-org";
import { getUserMemberships } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slugifyOrganizationName } from "@/lib/org/slug";
import { recordAuditEvent } from "@/lib/security/audit";

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
    locale,
  });

  if (!parsed.success) {
    return { error: "invalid_org" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
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
    const { loadOrCreateOrgDataKey } = await import(
      "@/lib/security/org-data-key"
    );
    await loadOrCreateOrgDataKey(org.id);
  }
  await recordAuditEvent({
    organizationId: org.id ?? null,
    actorUserId: user.id,
    actorKind: "staff",
    action: "organization.create",
    resourceType: "organization",
    resourceId: org.id,
    metadata: { name: parsed.data.name },
  });

  redirect(`/${locale}/home`);
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
  redirect(`/${parsed.data.locale}/home`);
}
