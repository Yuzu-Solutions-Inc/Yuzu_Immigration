import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  hashShareToken,
  SHARE_LINK_TTL_DAYS,
} from "@/lib/ircc/project-forms";
import { PII_AAD } from "@/lib/security/client-pii";
import { encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";

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

export type CreatedShareLink = {
  token: string;
  expiresAt: string;
  linkId: string;
  shareUrl: string;
};

/** Create a new share link (revokes are handled separately). */
export async function createShareLinkForProject(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    projectId: string;
    locale: string;
    createdBy?: string | null;
  },
): Promise<CreatedShareLink | null> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const tokenEncrypted = encryptField(
    token,
    PII_AAD.shareLinks.token,
    await getOrgDataKey(input.organizationId),
  );

  const { data, error } = await supabase
    .from("form_share_links")
    .insert({
      organization_id: input.organizationId,
      project_id: input.projectId,
      token_hash: hashShareToken(token),
      token_encrypted: tokenEncrypted,
      expires_at: expiresAt,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("create share link:", error?.message);
    return null;
  }

  const base = await getAppBaseUrl();
  const shareUrl = `${base}/${input.locale}/fill/${token}`;

  return {
    token,
    expiresAt,
    linkId: data.id as string,
    shareUrl,
  };
}
