import type { ProjectStatus } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

type StatusHistoryClient = Awaited<ReturnType<typeof createClient>>;

export async function recordProjectStatusHistory(
  supabase: StatusHistoryClient,
  input: {
    organizationId: string;
    projectId: string;
    status: ProjectStatus;
    statusAt: string;
    changedBy?: string | null;
  },
) {
  const { error } = await supabase.from("project_status_history").insert({
    organization_id: input.organizationId,
    project_id: input.projectId,
    status: input.status,
    status_at: input.statusAt,
    changed_by: input.changedBy ?? null,
  });

  if (error) {
    console.error("recordProjectStatusHistory:", error.message);
    return false;
  }
  return true;
}

export function statusChanged(
  previous: { status: string; status_at: string },
  next: { status: string; statusAt: string },
) {
  return previous.status !== next.status || previous.status_at !== next.statusAt;
}
