"use server";

import { revalidatePath } from "next/cache";

import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { parseModuleIds } from "@/lib/modules/catalog";
import { replaceOrganizationModules } from "@/lib/modules/org-modules";
import { createClient } from "@/lib/supabase/server";

export type UpdateModulesState = {
  error?: string;
  ok?: boolean;
};

export async function updateOrganizationModulesAction(
  _prev: UpdateModulesState,
  formData: FormData,
): Promise<UpdateModulesState> {
  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }

  const selected = parseModuleIds(formData.getAll("module"));
  const supabase = await createClient();
  const result = await replaceOrganizationModules(
    supabase,
    membership.organization.id,
    selected,
  );
  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
