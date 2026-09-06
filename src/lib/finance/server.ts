import "server-only";

import { getPrimaryMembership } from "@/lib/auth/session";
import { createFinanceDb, type FinanceDb } from "@/lib/finance/org-db";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { createClient } from "@/lib/supabase/server";

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
  return {
    db: createFinanceDb(supabase, membership.organization.id),
    orgId: membership.organization.id,
    userId: user.id,
  };
}
