import type { SupabaseClient } from "@supabase/supabase-js";

import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import type { BookingSettingsRow } from "@/lib/booking/types";
import { PII_AAD } from "@/lib/security/client-pii";
import { encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";

export function mintBookingPublicToken(orgId: string, dek: Buffer) {
  const token = createBookingToken();
  return {
    token,
    public_token_hash: hashBookingToken(token),
    public_token_encrypted: encryptField(token, PII_AAD.booking.token, dek),
  };
}

export function hostTimezone(
  rows: Array<{
    organization_id: string;
    user_id: string;
    timezone: string | null;
  }>,
  organizationId: string,
  hostUserId: string,
  fallback = "America/Toronto",
) {
  return (
    rows.find(
      (row) =>
        row.organization_id === organizationId && row.user_id === hostUserId,
    )?.timezone || fallback
  );
}

/**
 * Mint this staff member's public-booking page if it does not exist yet.
 * Hours can be saved without ever submitting calendar settings.
 */
export async function ensureBookingSettings(
  organizationId: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<BookingSettingsRow | null> {
  const existing = await supabase
    .from("booking_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) {
    console.error("ensureBookingSettings read:", existing.error.message);
    return null;
  }
  if (existing.data) return existing.data as BookingSettingsRow;

  const dek = await getOrgDataKey(organizationId);
  const minted = mintBookingPublicToken(organizationId, dek);
  const inserted = await supabase
    .from("booking_settings")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      public_token_hash: minted.public_token_hash,
      public_token_encrypted: minted.public_token_encrypted,
      is_enabled: false,
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await supabase
        .from("booking_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (raced.error) {
        console.error("ensureBookingSettings race:", raced.error.message);
        return null;
      }
      return (raced.data as BookingSettingsRow | null) ?? null;
    }
    console.error("ensureBookingSettings insert:", inserted.error.message);
    return null;
  }

  return inserted.data as BookingSettingsRow;
}
