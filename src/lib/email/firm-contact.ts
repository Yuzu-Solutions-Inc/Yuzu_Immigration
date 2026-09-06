import "server-only";

import { staffReplyTo } from "@/lib/email/reply-to";
import { decryptOrgRow } from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type FirmContact = {
  email: string;
  name: string;
};

function looksLikeEmail(value: string) {
  const at = value.lastIndexOf("@");
  return at > 0 && at < value.length - 1 && !value.includes(" ");
}

/**
 * Prefer the consultant/host mailbox, else the org privacy contact email.
 * Used in notification footers — never as Reply-To (replies are blocked).
 */
export async function resolveFirmContact(input: {
  organizationId?: string | null;
  staffUserId?: string | null;
  organizationName?: string | null;
}): Promise<FirmContact | null> {
  const staff = await staffReplyTo(input.staffUserId);
  if (staff) {
    return { email: staff.email, name: staff.name };
  }

  if (!input.organizationId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .select("name, privacy_contact_email")
    .eq("id", input.organizationId)
    .maybeSingle();
  if (error) {
    console.error("resolveFirmContact:", error.message);
    return null;
  }
  const orgKey = await getOrgDataKey(input.organizationId);
  const opened = decryptOrgRow(
    "organizations",
    {
      privacy_contact_email: data?.privacy_contact_email as string | null,
    },
    orgKey,
  );
  const email = opened.privacy_contact_email?.trim().toLowerCase();
  if (!email || !looksLikeEmail(email)) return null;
  const name =
    (data?.name as string | null)?.trim() ||
    input.organizationName?.trim() ||
    "Firm";
  return { email, name };
}
