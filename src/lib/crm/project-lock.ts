import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectStatus } from "@/db/schema";
import { isGrantedStatus } from "@/lib/crm/statuses";

export const PROJECT_GRANTED_LOCK_ERROR = "granted" as const;

export type ProjectGrantedLockError = typeof PROJECT_GRANTED_LOCK_ERROR;

export function isProjectModificationBlocked(
  status: ProjectStatus | string | null | undefined,
): boolean {
  return isGrantedStatus(status);
}

export async function loadProjectStatus(
  supabase: SupabaseClient,
  projectId: string,
  organizationId: string,
): Promise<ProjectStatus | null> {
  const { data, error } = await supabase
    .from("immigration_projects")
    .select("status")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return data.status as ProjectStatus;
}

export async function loadProjectStatusById(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectStatus | null> {
  const { data, error } = await supabase
    .from("immigration_projects")
    .select("status")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) return null;
  return data.status as ProjectStatus;
}

export async function assertProjectModifiable(
  supabase: SupabaseClient,
  projectId: string,
  organizationId: string,
): Promise<ProjectGrantedLockError | null> {
  const status = await loadProjectStatus(supabase, projectId, organizationId);
  if (isProjectModificationBlocked(status)) {
    return PROJECT_GRANTED_LOCK_ERROR;
  }
  return null;
}
