import { createServiceClient } from "@/lib/supabase/admin";
import { unwrapOrgDataKey, wrapOrgDataKey } from "@/lib/security/org-data-key";

export type RotateEncryptionResult = {
  dryRun: boolean;
  orgsRewrapped: number;
  orgsAlreadyNew: number;
};

/**
 * Re-wrap each org DEK with the new platform key.
 * Client data, files, and org secrets stay on the org DEK and are not rewritten.
 * Safe to re-run: wraps already on `newKey` are left unchanged.
 */
export async function rotateAppEncryptionKey(input: {
  oldKey: Buffer;
  newKey: Buffer;
  dryRun?: boolean;
}): Promise<RotateEncryptionResult> {
  const { oldKey, newKey, dryRun = false } = input;
  if (oldKey.equals(newKey)) {
    throw new Error("rotate_keys_identical");
  }

  const admin = createServiceClient();
  const { data: orgRows, error: orgError } = await admin
    .from("organizations")
    .select("id, wrapped_dek")
    .order("created_at", { ascending: true });
  if (orgError) throw new Error(`organizations: ${orgError.message}`);

  let orgsRewrapped = 0;
  let orgsAlreadyNew = 0;
  for (const org of orgRows ?? []) {
    const orgId = org.id as string;
    const wrapped = org.wrapped_dek as string | null;
    if (!wrapped) continue;

    let dek: Buffer;
    try {
      dek = unwrapOrgDataKey(wrapped, orgId, newKey);
      orgsAlreadyNew += 1;
      continue;
    } catch {
      dek = unwrapOrgDataKey(wrapped, orgId, oldKey);
    }
    orgsRewrapped += 1;
    if (dryRun) continue;
    const next = wrapOrgDataKey(dek, orgId, newKey);
    const { error } = await admin
      .from("organizations")
      .update({ wrapped_dek: next, updated_at: new Date().toISOString() })
      .eq("id", orgId);
    if (error) throw new Error(`org wrap update: ${error.message}`);
  }

  return { dryRun, orgsRewrapped, orgsAlreadyNew };
}
