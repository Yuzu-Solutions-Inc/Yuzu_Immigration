import {
  PROFILE_REP_SELECT,
  representativeDisplayName,
} from "@/lib/ircc/account-rep";
import { resolveShareToken } from "@/lib/ircc/project-forms";
import { decryptProjectRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type ShareFillHeaderContext = {
  organizationName: string;
  representativeName: string;
};

/** Branding for the client share-link shell — valid token only, no auth required. */
export async function loadShareHeaderContext(
  token: string,
): Promise<ShareFillHeaderContext | null> {
  try {
    const resolved = await resolveShareToken(token);
    if (!resolved) return null;

    const admin = createServiceClient();
    const [projectRes, orgRes] = await Promise.all([
      admin
        .from("immigration_projects")
        .select("title, organization_id, representative_user_id")
        .eq("id", resolved.projectId)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("name")
        .eq("id", resolved.organizationId)
        .maybeSingle(),
    ]);

    if (!projectRes.data) return null;

    const key = await getOrgDataKey(resolved.organizationId);
    const project = decryptProjectRow(
      projectRes.data as {
        title: string;
        organization_id: string;
        representative_user_id: string | null;
      },
      key,
    );

    let representativeName = "";
    if (project.representative_user_id) {
      const { data: repProfile } = await admin
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", project.representative_user_id)
        .maybeSingle();
      representativeName = representativeDisplayName(repProfile);
    }

    return {
      organizationName: String(orgRes.data?.name ?? ""),
      representativeName,
    };
  } catch (err) {
    console.error("loadShareHeaderContext:", err);
    return null;
  }
}
