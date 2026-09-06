"use client";

import { useMemo, type ReactNode } from "react";

import { PeriodCloseProvider } from "@/components/finance/contexts/PeriodCloseContext";
import { AmountPrivacyProvider } from "@/components/finance/contexts/AmountPrivacyContext";
import { runFinanceQueryAction } from "@/app/actions/finance-query";
import { createClient } from "@/lib/supabase/client";
import { bindFinanceDb, createFinanceDb } from "@/lib/finance/org-db";
import type { OrgAccessLevel } from "@/lib/auth/rbac";
import { WorkspaceProvider } from "@/components/finance/contexts/WorkspaceContext";

export function FinanceSessionProvider({
  orgId,
  role,
  children,
}: {
  orgId: string;
  role: OrgAccessLevel;
  children: ReactNode;
}) {
  const db = useMemo(
    () => createFinanceDb(createClient(), orgId, { runRead: runFinanceQueryAction }),
    [orgId],
  );
  bindFinanceDb(db);

  return (
    <WorkspaceProvider organizationId={orgId} role={role}>
      <AmountPrivacyProvider>
        <PeriodCloseProvider>{children}</PeriodCloseProvider>
      </AmountPrivacyProvider>
    </WorkspaceProvider>
  );
}
