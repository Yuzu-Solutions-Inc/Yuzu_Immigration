import { createHmac } from "node:crypto";

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

export function projectSearchTitle(title: string) {
  return normalizeSearchText(title);
}

export function personLookupWrite(
  organizationId: string,
  input: { first_name: string; last_name: string; email?: string | null },
  orgKey: Buffer,
) {
  const email = input.email?.trim();
  return {
    email_lookup_hash: email
      ? hashEmailLookup(organizationId, email, orgKey)
      : null,
    search_name: personSearchName(input.first_name, input.last_name),
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

export function escapeIlike(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function looksLikeEmail(query: string) {
  return query.includes("@");
}
