import { createHmac } from "node:crypto";

import {
  hasAppEncryptionKey,
  requireAppEncryptionKey,
} from "@/lib/security/app-encryption-key";

export function normalizeGuestEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashBookingSubject(
  kind: "email" | "ip",
  organizationId: string,
  value: string,
  hmacKey: Buffer,
) {
  return createHmac("sha256", hmacKey)
    .update(`booking-${kind}:${organizationId}:${value}`)
    .digest("hex");
}

export function hashEmailLookup(
  organizationId: string,
  email: string,
  hmacKey: Buffer,
) {
  return hashBookingSubject(
    "email",
    organizationId,
    normalizeGuestEmail(email),
    hmacKey,
  );
}

export function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function personSearchName(firstName: string, lastName: string) {
  return normalizeSearchText(`${firstName} ${lastName}`);
}

/** Case-insensitive substring match on decrypted text. Empty query matches all. */
export function matchesSearchQuery(haystack: string, query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  return normalizeSearchText(haystack).includes(needle);
}

export function comparePersonSearchName(
  a: { first_name: string; last_name: string },
  b: { first_name: string; last_name: string },
) {
  return personSearchName(a.first_name, a.last_name).localeCompare(
    personSearchName(b.first_name, b.last_name),
    "en",
    { sensitivity: "base" },
  );
}

export function hashPortalEmail(email: string, appKey: Buffer) {
  return createHmac("sha256", appKey)
    .update(`portal-email:${normalizeGuestEmail(email)}`)
    .digest("hex");
}

/** Platform-wide bounce/complaint lookup. Never store the plaintext address. */
export function hashEmailSuppression(email: string, appKey: Buffer) {
  return createHmac("sha256", appKey)
    .update(`email-suppression:${normalizeGuestEmail(email)}`)
    .digest("hex");
}

export function personLookupWrite(
  organizationId: string,
  input: { first_name: string; last_name: string; email?: string | null },
  orgKey: Buffer,
) {
  const email = input.email?.trim();
  const portalEmailHash =
    email && hasAppEncryptionKey()
      ? hashPortalEmail(email, requireAppEncryptionKey())
      : null;
  return {
    email_lookup_hash: email
      ? hashEmailLookup(organizationId, email, orgKey)
      : null,
    portal_email_hash: portalEmailHash,
  };
}

export function appointmentLookupWrite(
  organizationId: string,
  email: string,
  orgKey: Buffer,
) {
  return {
    email_lookup_hash: hashEmailLookup(organizationId, email, orgKey),
  };
}

export function looksLikeEmail(query: string) {
  return query.includes("@");
}
