import { getAppBaseUrl } from "@/lib/app-url";
import { PII_AAD } from "@/lib/security/client-pii";
import { decryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

/** Active client fill link for a project (service role). */
export async function resolveProjectShareUrl(
  organizationId: string,
  projectId: string,
  locale: string,
): Promise<string | null> {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("form_share_links")
    .select("token_encrypted")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.token_encrypted) return null;

  try {
    const key = await getOrgDataKey(organizationId);
    const token = decryptField(
      data.token_encrypted as string,
      PII_AAD.shareLinks.token,
      key,
    );
    const base = await getAppBaseUrl();
    return `${base}/${locale}/fill/${token}`;
  } catch {
    return null;
  }
}

export function personDisplayName(input: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const name = `${input.first_name ?? ""} ${input.last_name ?? ""}`.trim();
  return name || input.email || "";
}
