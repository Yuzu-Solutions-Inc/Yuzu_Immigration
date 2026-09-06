import "server-only";

import { getPrimaryMembership } from "@/lib/auth/session";
import { createFinanceDb, type FinanceDb, type QueryResult } from "@/lib/finance/org-db";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import {
  decryptOrgPayload,
  encryptOrgValues,
  isOrgEncryptedTable,
  sortDecryptedRows,
} from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

async function financeCrypto(orgId: string) {
  const key = await getOrgDataKey(orgId);
  return {
    async openRead(table: string, result: QueryResult): Promise<QueryResult> {
      if (result.error || result.data == null || !isOrgEncryptedTable(table)) {
        return result;
      }
      const data = decryptOrgPayload(table, result.data, key);
      return {
        ...result,
        data: Array.isArray(data) ? sortDecryptedRows(table, data) : data,
      };
    },
    async seal(table: string, values: unknown) {
      if (!isOrgEncryptedTable(table) || values == null) return values;
      return encryptOrgValues(table, values, key);
    },
  };
}

export async function requireFinanceWorkspace(): Promise<{
  db: FinanceDb;
  orgId: string;
  userId: string;
}> {
  const membership = await getPrimaryMembership();
  if (!membership || !isModuleEnabled(membership.enabledModules, "finance")) {
    throw new Error("forbidden");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("auth");
  const orgId = membership.organization.id;
  return {
    db: createFinanceDb(supabase, orgId, await financeCrypto(orgId)),
    orgId,
    userId: user.id,
  };
}
