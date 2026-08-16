import { randomBytes } from "node:crypto";
import { cache } from "react";

import {
  activeAppWrapKey,
  appWrapKeysForUnwrap,
} from "@/lib/security/app-encryption-key";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { createServiceClient } from "@/lib/supabase/admin";

const WRAP_AAD_PREFIX = "organizations.wrapped_dek";

export function generateOrgDataKey(): Buffer {
  return randomBytes(32);
}

function wrapAad(orgId: string): string {
  return `${WRAP_AAD_PREFIX}:${orgId}`;
}

export function wrapOrgDataKey(
  dek: Buffer,
  orgId: string,
  wrapKey?: Buffer,
): string {
  if (dek.length !== 32) {
    throw new Error("invalid_org_dek");
  }
  return encryptField(
    dek.toString("base64"),
    wrapAad(orgId),
    wrapKey ?? activeAppWrapKey(),
  );
}

function decodeOrgDek(wrapped: string, orgId: string, wrapKey: Buffer): Buffer {
  const decoded = Buffer.from(
    decryptField(wrapped, wrapAad(orgId), wrapKey),
    "base64",
  );
  if (decoded.length !== 32) {
    throw new Error("invalid_org_dek");
  }
  return decoded;
}

export function unwrapOrgDataKey(
  wrapped: string,
  orgId: string,
  wrapKey?: Buffer,
): Buffer {
  if (wrapKey) {
    return decodeOrgDek(wrapped, orgId, wrapKey);
  }

  const keys = appWrapKeysForUnwrap();
  let lastError: unknown;
  for (const key of keys) {
    try {
      return decodeOrgDek(wrapped, orgId, key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("unwrap_failed");
}

/**
 * Load this org's 32-byte DEK, creating and wrapping one if missing.
 * Uses service role so the write is not blocked by the protect trigger.
 */
export async function loadOrCreateOrgDataKey(orgId: string): Promise<Buffer> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .select("wrapped_dek")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`org dek read: ${error.message}`);
  }
  if (!data) {
    throw new Error("org_not_found");
  }
  if (data.wrapped_dek) {
    return unwrapOrgDataKey(data.wrapped_dek as string, orgId);
  }

  const dek = generateOrgDataKey();
  const wrapped = wrapOrgDataKey(dek, orgId);
  const { data: updated, error: updateError } = await admin
    .from("organizations")
    .update({
      wrapped_dek: wrapped,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId)
    .is("wrapped_dek", null)
    .select("wrapped_dek")
    .maybeSingle();

  if (updateError) {
    throw new Error(`org dek write: ${updateError.message}`);
  }
  if (updated?.wrapped_dek) {
    return dek;
  }

  const { data: raced, error: raceError } = await admin
    .from("organizations")
    .select("wrapped_dek")
    .eq("id", orgId)
    .maybeSingle();
  if (raceError || !raced?.wrapped_dek) {
    throw new Error(raceError?.message ?? "org_dek_missing");
  }
  return unwrapOrgDataKey(raced.wrapped_dek as string, orgId);
}

/** Request-scoped unwrap. Same org id is loaded once per server render/action. */
export const getOrgDataKey = cache(loadOrCreateOrgDataKey);
