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

/**
 * Mint the org public-booking page if it does not exist yet.
 * Hours and services can be saved without ever submitting calendar
 * settings, so callers that complete those steps should ensure this row.
 */
export async function ensureOrgBookingSettings(
  organizationId: string,
  supabase: SupabaseClient,
): Promise<BookingSettingsRow | null> {
  const existing = await supabase
    .from("booking_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (existing.error) {
    console.error("ensureOrgBookingSettings read:", existing.error.message);
    return null;
  }
  if (existing.data) return existing.data as BookingSettingsRow;

  const dek = await getOrgDataKey(organizationId);
  const minted = mintBookingPublicToken(organizationId, dek);
  const inserted = await supabase
    .from("booking_settings")
    .insert({
      organization_id: organizationId,
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
        .maybeSingle();
      if (raced.error) {
        console.error("ensureOrgBookingSettings race:", raced.error.message);
        return null;
      }
      return (raced.data as BookingSettingsRow | null) ?? null;
    }
    console.error("ensureOrgBookingSettings insert:", inserted.error.message);
    return null;
  }

  return inserted.data as BookingSettingsRow;
}
