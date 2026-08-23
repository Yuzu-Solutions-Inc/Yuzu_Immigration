import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  hasAppEncryptionKey,
  requireAppEncryptionKey,
} from "@/lib/security/app-encryption-key";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signUserId(userId: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`trial-email-unsub:${userId}`)
    .digest("hex");
}

function signaturesMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function trialUnsubscribeToken(userId: string): string | null {
  if (!hasAppEncryptionKey()) return null;
  if (!UUID_RE.test(userId)) return null;
  return `${userId}.${signUserId(userId)}`;
}

export function verifyTrialUnsubscribeToken(token: string): string | null {
  if (!hasAppEncryptionKey()) return null;
  const trimmed = token.trim();
  const dot = trimmed.indexOf(".");
  if (dot < 1) return null;
  const userId = trimmed.slice(0, dot);
  const signature = trimmed.slice(dot + 1);
  if (!UUID_RE.test(userId) || !/^[0-9a-f]{64}$/i.test(signature)) {
    return null;
  }
  if (!signaturesMatch(signature, signUserId(userId))) return null;
  return userId.toLowerCase();
}

export async function trialEmailUnsubscribed(userId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("profiles")
    .select("trial_email_unsubscribed_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("trial unsubscribe lookup:", error.message);
    return false;
  }
  return Boolean(data?.trial_email_unsubscribed_at);
}

export async function applyTrialEmailUnsubscribe(token: string): Promise<{
  ok: boolean;
  already: boolean;
}> {
  const userId = verifyTrialUnsubscribeToken(token);
  if (!userId) return { ok: false, already: false };

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, trial_email_unsubscribed_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("trial unsubscribe load:", error.message);
    return { ok: false, already: false };
  }
  if (!data) return { ok: false, already: false };
  if (data.trial_email_unsubscribed_at) {
    return { ok: true, already: true };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      trial_email_unsubscribed_at: now,
      updated_at: now,
    })
    .eq("id", userId);
  if (updateError) {
    console.error("trial unsubscribe save:", updateError.message);
    return { ok: false, already: false };
  }
  return { ok: true, already: false };
}
