import type { SupabaseClient } from "@supabase/supabase-js";

export async function revokeAllShareLinksForProject(
  supabase: SupabaseClient,
  projectId: string,
  organizationId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("form_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("revoke share links:", error.message);
    return false;
  }

  return true;
}
