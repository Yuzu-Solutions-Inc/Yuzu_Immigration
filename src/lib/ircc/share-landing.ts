import { listActiveProjectPeople, resolveShareToken } from "@/lib/ircc/project-forms";
import { decryptProjectRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type ShareLandingSummary = {
  organizationId: string;
  projectId: string;
  linkId: string;
  expiresAt: string;
  projectTitle: string;
  programFamily: string;
  personIds: string[];
};

/** Lightweight authenticated landing data — avoids full questionnaire load. */
export async function loadShareLandingSummary(
  token: string,
): Promise<ShareLandingSummary | null> {
  try {
    const resolved = await resolveShareToken(token);
    if (!resolved) return null;

    const { assertShareAuthenticated } = await import("@/lib/ircc/share-auth");
    try {
      await assertShareAuthenticated(token);
    } catch {
      return null;
    }

    const admin = createServiceClient();
    const { data, error } = await admin
      .from("immigration_projects")
      .select("title, program_family, organization_id")
      .eq("id", resolved.projectId)
      .maybeSingle();

    if (error || !data) {
      console.error("loadShareLandingSummary project:", error?.message);
      return null;
    }

    const key = await getOrgDataKey(resolved.organizationId);
    const project = decryptProjectRow(
      data as {
        title: string;
        program_family: string;
        organization_id: string;
      },
      key,
    );

    const people = await listActiveProjectPeople(admin, resolved.projectId);

    return {
      organizationId: resolved.organizationId,
      projectId: resolved.projectId,
      linkId: resolved.linkId,
      expiresAt: resolved.expiresAt,
      projectTitle: project.title,
      programFamily: String(project.program_family ?? "other"),
      personIds: people.map((person) => person.id),
    };
  } catch (err) {
    console.error("loadShareLandingSummary:", err);
    return null;
  }
}
