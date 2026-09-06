import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isModuleId,
  normalizeModuleSelection,
  validateModuleSelection,
  type ModuleId,
} from "@/lib/modules/catalog";

export async function loadEnabledModules(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ModuleId[]> {
  const { data, error } = await supabase
    .from("organization_modules")
    .select("module_id")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("loadEnabledModules:", error.message);
    return [];
  }

  return normalizeModuleSelection(
    (data ?? []).map((row) => row.module_id).filter(isModuleId),
  );
}

export async function replaceOrganizationModules(
  supabase: SupabaseClient,
  organizationId: string,
  moduleIds: ModuleId[],
): Promise<{ error?: string }> {
  const parsed = normalizeModuleSelection(moduleIds);
  const invalid = validateModuleSelection(parsed);
  if (invalid) {
    return { error: invalid };
  }

  const { error: deleteError } = await supabase
    .from("organization_modules")
    .delete()
    .eq("organization_id", organizationId);

  if (deleteError) {
    console.error("replaceOrganizationModules delete:", deleteError.message);
    return { error: "save_failed" };
  }

  if (parsed.length === 0) {
    return {};
  }

  const { error: insertError } = await supabase.from("organization_modules").insert(
    parsed.map((module_id) => ({
      organization_id: organizationId,
      module_id,
    })),
  );

  if (insertError) {
    console.error("replaceOrganizationModules insert:", insertError.message);
    return { error: "save_failed" };
  }

  return {};
}

export function isModuleEnabled(
  enabled: ReadonlyArray<ModuleId> | ReadonlySet<ModuleId>,
  id: ModuleId,
): boolean {
  for (const value of enabled) {
    if (value === id) return true;
  }
  return false;
}
