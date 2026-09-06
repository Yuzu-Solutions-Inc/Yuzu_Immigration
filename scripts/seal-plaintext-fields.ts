import { resolve } from "node:path";

import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });

/**
 * Seal leftover plaintext PII with the org DEK (or app wrap key for profiles).
 * Safe to re-run: already-prefixed `mc1.` values are left unchanged.
 */
async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/admin");
  const { loadOrCreateOrgDataKey } = await import(
    "../src/lib/security/org-data-key"
  );
  const {
    ORG_ENCRYPTED_COLUMNS,
    encryptOrgRow,
    rowNeedsSeal,
  } = await import("../src/lib/security/encrypted-fields");
  const { encryptProfileWrite } = await import("../src/lib/security/profile-pii");
  const { isEncryptedField } = await import("../src/lib/security/field-crypto");
  const { requireAppEncryptionKey } = await import(
    "../src/lib/security/app-encryption-key"
  );

  const admin = createServiceClient();
  const { data: orgs, error: orgError } = await admin
    .from("organizations")
    .select("id")
    .is("deleted_at", null);
  if (orgError) throw new Error(orgError.message);

  let sealedRows = 0;
  const orgTables = Object.keys(ORG_ENCRYPTED_COLUMNS).filter(
    (table) => table !== "organizations" && table !== "organization_invitations",
  );

  const TABLE_KEY: Record<string, string> = {
    organization_settings: "organization_id",
  };

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const key = await loadOrCreateOrgDataKey(orgId);

    for (const table of orgTables) {
      const columns = ORG_ENCRYPTED_COLUMNS[table];
      const pk = TABLE_KEY[table] ?? "id";
      const { data, error } = await admin
        .from(table)
        .select("*")
        .eq("organization_id", orgId);
      if (error) {
        if (/does not exist|schema cache|column/i.test(error.message)) {
          console.warn(`${table}:`, error.message);
          continue;
        }
        console.error(`${table}:`, error.message);
        continue;
      }
      for (const row of data ?? []) {
        const record = row as unknown as Record<string, unknown>;
        if (!rowNeedsSeal(table, record)) continue;
        const keyValue = record[pk];
        const fields: Record<string, unknown> = {};
        for (const column of columns) {
          if (column in record) fields[column] = record[column];
        }
        const { error: updateError } = await admin
          .from(table)
          .update(encryptOrgRow(table, fields, key))
          .eq(pk, keyValue as string)
          .eq("organization_id", orgId);
        if (updateError) {
          console.error(`${table} ${String(keyValue)}:`, updateError.message);
          continue;
        }
        sealedRows += 1;
      }
    }

    const { data: orgRow } = await admin
      .from("organizations")
      .select(
        "id, privacy_contact_email, owner_contact_name, owner_contact_email",
      )
      .eq("id", orgId)
      .maybeSingle();
    if (orgRow && rowNeedsSeal("organizations", orgRow as Record<string, unknown>)) {
      const { id, ...fields } = orgRow as Record<string, unknown>;
      void id;
      await admin
        .from("organizations")
        .update(encryptOrgRow("organizations", fields, key))
        .eq("id", orgId);
      sealedRows += 1;
    }

    const { data: invites } = await admin
      .from("organization_invitations")
      .select("id, email")
      .eq("organization_id", orgId);
    for (const row of invites ?? []) {
      const record = row as Record<string, unknown>;
      if (!rowNeedsSeal("organization_invitations", record)) continue;
      await admin
        .from("organization_invitations")
        .update(encryptOrgRow("organization_invitations", { email: record.email }, key))
        .eq("id", record.id as string);
      sealedRows += 1;
    }

    await admin
      .from("people")
      .update({ search_name: null })
      .eq("organization_id", orgId)
      .not("search_name", "is", null);
    await admin
      .from("immigration_projects")
      .update({ search_title: null })
      .eq("organization_id", orgId)
      .not("search_title", "is", null);
  }

  const appKey = requireAppEncryptionKey();
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select(
      "id, full_name, rep_family_name, rep_given_name, rep_organization, rep_email, rep_phone, rep_phone_country_code, rep_membership_id, rep_street_num, rep_street_name, rep_city, rep_province, rep_country, rep_postal_code",
    );
  if (profileError) throw new Error(profileError.message);

  let sealedProfiles = 0;
  for (const row of profiles ?? []) {
    const record = row as Record<string, unknown>;
    const needs = [
      "full_name",
      "rep_family_name",
      "rep_given_name",
      "rep_organization",
      "rep_email",
      "rep_phone",
      "rep_phone_country_code",
      "rep_membership_id",
      "rep_street_num",
      "rep_street_name",
      "rep_city",
      "rep_province",
      "rep_country",
      "rep_postal_code",
    ].some((column) => {
      const value = record[column];
      return typeof value === "string" && value !== "" && !isEncryptedField(value);
    });
    if (!needs) continue;
    const { id, ...fields } = record;
    const { error: updateError } = await admin
      .from("profiles")
      .update(encryptProfileWrite(fields, appKey))
      .eq("id", id as string);
    if (updateError) {
      console.error(`profiles ${id}:`, updateError.message);
      continue;
    }
    sealedProfiles += 1;
  }

  console.log(
    JSON.stringify({ sealedRows, sealedProfiles, orgs: (orgs ?? []).length }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
