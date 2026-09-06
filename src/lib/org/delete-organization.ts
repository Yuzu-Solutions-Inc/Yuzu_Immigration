import "server-only";

import { CONTRACT_ENVELOPES_BUCKET } from "@/lib/contracts/types";
import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import { stripeConfigured, getStripe } from "@/lib/stripe/client";
import { decryptProfileRow } from "@/lib/security/profile-pii";
import { createServiceClient } from "@/lib/supabase/admin";

const STORAGE_REMOVE_CHUNK = 100;
const STORAGE_LIST_PAGE = 1000;

const ORG_STORAGE_BUCKETS = [
  CLIENT_DOCUMENTS_BUCKET,
  CONTRACT_ENVELOPES_BUCKET,
] as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function listStorageUnderPrefix(
  admin: ReturnType<typeof createServiceClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const queue = [prefix.replace(/\/$/, "")];
  while (queue.length > 0) {
    const current = queue.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(current, { limit: STORAGE_LIST_PAGE, offset });
      if (error) {
        console.error("org storage list:", bucket, error.message);
        break;
      }
      const items = data ?? [];
      for (const item of items) {
        const path = current ? `${current}/${item.name}` : item.name;
        if (!item.id) queue.push(path);
        else paths.push(path);
      }
      if (items.length < STORAGE_LIST_PAGE) break;
      offset += items.length;
    }
  }
  return paths;
}

export async function deleteOrganizationStorage(organizationId: string) {
  const admin = createServiceClient();
  for (const bucket of ORG_STORAGE_BUCKETS) {
    const paths = await listStorageUnderPrefix(admin, bucket, organizationId);
    for (const group of chunk(paths, STORAGE_REMOVE_CHUNK)) {
      const { error } = await admin.storage.from(bucket).remove(group);
      if (error) {
        console.error("org storage remove:", bucket, error.message);
      }
    }
  }
}

export async function cancelOrganizationSubscription(organizationId: string) {
  if (!stripeConfigured()) return;
  const admin = createServiceClient();
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_subscription_id")
    .eq("id", organizationId)
    .maybeSingle();
  const subscriptionId = org?.stripe_subscription_id as string | null;
  if (!subscriptionId) return;
  try {
    await getStripe().subscriptions.cancel(subscriptionId);
  } catch (error) {
    console.error("cancel org subscription:", error);
  }
}

export async function loadOwnerContact(organizationId: string): Promise<{
  name: string;
  email: string;
}> {
  const admin = createServiceClient();
  const { data: owner } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .maybeSingle();
  if (!owner?.user_id) return { name: "", email: "" };
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", owner.user_id as string)
    .maybeSingle();
  const opened = decryptProfileRow(
    (profile ?? {}) as { full_name?: string | null; email?: string | null },
  );
  return {
    name: (opened.full_name ?? "").trim(),
    email: ((profile?.email as string | null) ?? "").trim().toLowerCase(),
  };
}
