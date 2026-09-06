"use server";

import { getPrimaryMembership } from "@/lib/auth/session";
import {
  decryptOrgPayload,
  encryptOrgValues,
  isOrgEncryptedTable,
  sortDecryptedRows,
} from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
  status?: number;
  statusText?: string;
};

export async function sealFinanceValuesAction(
  table: string,
  values: unknown,
): Promise<unknown> {
  if (!isOrgEncryptedTable(table) || values == null) return values;
  const membership = await getPrimaryMembership();
  if (!membership) throw new Error("auth");
  const key = await getOrgDataKey(membership.organization.id);
  return encryptOrgValues(table, values, key);
}

export async function openFinanceResultAction(
  table: string,
  result: QueryResult,
): Promise<QueryResult> {
  if (result.error || result.data == null || !isOrgEncryptedTable(table)) {
    return result;
  }
  const membership = await getPrimaryMembership();
  if (!membership) throw new Error("auth");
  const key = await getOrgDataKey(membership.organization.id);
  const data = decryptOrgPayload(table, result.data, key);
  return {
    ...result,
    data: Array.isArray(data) ? sortDecryptedRows(table, data) : data,
  };
}
