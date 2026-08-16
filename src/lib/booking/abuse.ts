import { headers } from "next/headers";

import {
  hashBookingSubject,
  normalizeGuestEmail,
} from "@/lib/security/email-lookup";
import { createServiceClient } from "@/lib/supabase/admin";

export const MAX_FUTURE_BOOKINGS_PER_EMAIL = 3;
export const BOOK_ATTEMPTS_PER_EMAIL_PER_HOUR = 8;
export const BOOK_ATTEMPTS_PER_IP_PER_HOUR = 15;
export const BOOK_SUCCESS_PER_EMAIL_PER_DAY = 3;
export const BOOK_SUCCESS_PER_IP_PER_DAY = 8;
export const BOOK_EMAIL_COOLDOWN_SECONDS = 45;
export const MANAGE_LINKS_COOLDOWN_SECONDS = 15 * 60;
export const MANAGE_LINKS_PER_EMAIL_PER_DAY = 4;
export const MANAGE_LINKS_PER_IP_PER_DAY = 8;

export type AbuseKind = "book_attempt" | "book_success" | "manage_links";

export { hashBookingSubject, normalizeGuestEmail };

export async function getRequestClientIp() {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      null
    );
  } catch {
    return null;
  }
}

async function countEvents(input: {
  organizationId: string;
  kind: AbuseKind;
  emailHash?: string | null;
  ipHash?: string | null;
  sinceIso: string;
}) {
  const admin = createServiceClient();
  let query = admin
    .from("booking_abuse_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", input.organizationId)
    .eq("kind", input.kind)
    .gte("created_at", input.sinceIso);
  if (input.emailHash) query = query.eq("email_hash", input.emailHash);
  if (input.ipHash) query = query.eq("ip_hash", input.ipHash);
  const { count, error } = await query;
  if (error) {
    console.error("booking abuse count:", error.message);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

export async function recordBookingAbuseEvent(input: {
  organizationId: string;
  kind: AbuseKind;
  emailHash?: string | null;
  ipHash?: string | null;
}) {
  const admin = createServiceClient();
  const { error } = await admin.from("booking_abuse_events").insert({
    organization_id: input.organizationId,
    kind: input.kind,
    email_hash: input.emailHash ?? null,
    ip_hash: input.ipHash ?? null,
  });
  if (error) console.error("booking abuse insert:", error.message);
}

export async function pruneBookingAbuseEvents() {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const admin = createServiceClient();
  const { error } = await admin
    .from("booking_abuse_events")
    .delete()
    .lt("created_at", cutoff);
  if (error) console.error("booking abuse prune:", error.message);
}

function agoIso(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

export async function checkPublicBookRateLimit(input: {
  organizationId: string;
  emailHash: string;
  ipHash: string | null;
}): Promise<"ok" | "rate_limited"> {
  const hour = agoIso(60 * 60);
  const day = agoIso(24 * 60 * 60);
  const cooldown = agoIso(BOOK_EMAIL_COOLDOWN_SECONDS);

  const [
    emailAttemptsHour,
    emailSuccessDay,
    emailCooldown,
    ipAttemptsHour,
    ipSuccessDay,
  ] = await Promise.all([
    countEvents({
      organizationId: input.organizationId,
      kind: "book_attempt",
      emailHash: input.emailHash,
      sinceIso: hour,
    }),
    countEvents({
      organizationId: input.organizationId,
      kind: "book_success",
      emailHash: input.emailHash,
      sinceIso: day,
    }),
    countEvents({
      organizationId: input.organizationId,
      kind: "book_success",
      emailHash: input.emailHash,
      sinceIso: cooldown,
    }),
    input.ipHash
      ? countEvents({
          organizationId: input.organizationId,
          kind: "book_attempt",
          ipHash: input.ipHash,
          sinceIso: hour,
        })
      : Promise.resolve(0),
    input.ipHash
      ? countEvents({
          organizationId: input.organizationId,
          kind: "book_success",
          ipHash: input.ipHash,
          sinceIso: day,
        })
      : Promise.resolve(0),
  ]);

  if (emailAttemptsHour >= BOOK_ATTEMPTS_PER_EMAIL_PER_HOUR) return "rate_limited";
  if (emailSuccessDay >= BOOK_SUCCESS_PER_EMAIL_PER_DAY) return "rate_limited";
  if (emailCooldown >= 1) return "rate_limited";
  if (ipAttemptsHour >= BOOK_ATTEMPTS_PER_IP_PER_HOUR) return "rate_limited";
  if (ipSuccessDay >= BOOK_SUCCESS_PER_IP_PER_DAY) return "rate_limited";
  return "ok";
}

export async function checkManageLinksRateLimit(input: {
  organizationId: string;
  emailHash: string;
  ipHash: string | null;
}): Promise<"ok" | "cooldown"> {
  const cooldown = agoIso(MANAGE_LINKS_COOLDOWN_SECONDS);
  const day = agoIso(24 * 60 * 60);
  const [emailCooldown, emailDay, ipDay] = await Promise.all([
    countEvents({
      organizationId: input.organizationId,
      kind: "manage_links",
      emailHash: input.emailHash,
      sinceIso: cooldown,
    }),
    countEvents({
      organizationId: input.organizationId,
      kind: "manage_links",
      emailHash: input.emailHash,
      sinceIso: day,
    }),
    input.ipHash
      ? countEvents({
          organizationId: input.organizationId,
          kind: "manage_links",
          ipHash: input.ipHash,
          sinceIso: day,
        })
      : Promise.resolve(0),
  ]);
  if (emailCooldown >= 1) return "cooldown";
  if (emailDay >= MANAGE_LINKS_PER_EMAIL_PER_DAY) return "cooldown";
  if (ipDay >= MANAGE_LINKS_PER_IP_PER_DAY) return "cooldown";
  return "ok";
}
