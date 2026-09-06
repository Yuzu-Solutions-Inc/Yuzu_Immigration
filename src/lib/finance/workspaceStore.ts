import { getBoundFinanceDb } from "./org-db";

export function requireOrgId(): string {
  return getBoundFinanceDb().orgId;
}
