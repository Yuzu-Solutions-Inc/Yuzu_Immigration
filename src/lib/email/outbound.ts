import "server-only";

import {
  hashEmailSuppression,
  normalizeGuestEmail,
} from "@/lib/security/email-lookup";
import {
  hasAppEncryptionKey,
  requireAppEncryptionKey,
} from "@/lib/security/app-encryption-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type OutboundEmailStatus =
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "delayed"
  | "suppressed";

export type SuppressionReason = "bounced" | "complained";

function recipientHash(email: string) {
  if (!hasAppEncryptionKey()) return null;
  return hashEmailSuppression(email, requireAppEncryptionKey());
}

export async function isEmailSuppressed(email: string) {
  const hash = recipientHash(email);
  if (!hash) return false;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("email_suppressions")
    .select("email_hash")
    .eq("email_hash", hash)
    .maybeSingle();
  if (error) {
    console.error("email suppression lookup:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function recordOutboundEmail(input: {
  organizationId?: string | null;
  kind: string;
  idempotencyKey: string;
  resendEmailId: string | null;
  to: string;
  status: OutboundEmailStatus;
}) {
  const toHash = recipientHash(input.to);
  if (!toHash) return;
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("outbound_emails").upsert(
    {
      organization_id: input.organizationId ?? null,
      kind: input.kind,
      idempotency_key: input.idempotencyKey.slice(0, 256),
      resend_email_id: input.resendEmailId,
      to_hash: toHash,
      status: input.status,
      updated_at: now,
    },
    { onConflict: "idempotency_key" },
  );
  if (error) {
    console.error("outbound email record:", error.message);
  }
}

export async function applyOutboundEmailEvent(input: {
  resendEmailId: string;
  status: OutboundEmailStatus;
  recipients: string[];
  suppress?: SuppressionReason;
}) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("outbound_emails")
    .update({ status: input.status, updated_at: now })
    .eq("resend_email_id", input.resendEmailId);
  if (updateError) {
    console.error("outbound email status:", updateError.message);
  }

  if (!input.suppress) return;
  const hashes = input.recipients
    .map((email) => recipientHash(normalizeGuestEmail(email)))
    .filter((hash): hash is string => Boolean(hash));
  for (const emailHash of hashes) {
    const { error } = await admin.from("email_suppressions").upsert(
      {
        email_hash: emailHash,
        reason: input.suppress,
        resend_email_id: input.resendEmailId,
        updated_at: now,
      },
      { onConflict: "email_hash" },
    );
    if (error) {
      console.error("email suppression upsert:", error.message);
    }
  }
}

export function emailIdempotencyKey(...parts: Array<string | number>) {
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("/")
    .slice(0, 256);
}
