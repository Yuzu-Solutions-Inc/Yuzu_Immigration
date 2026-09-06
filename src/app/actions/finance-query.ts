"use server";

import { parseFinanceQuery, type FinanceQueryCall } from "@/lib/finance/query-calls";
import type { QueryResult } from "@/lib/finance/org-db";
import { requireFinanceWorkspace } from "@/lib/finance/server";

export async function runFinanceQueryAction(
  table: string,
  calls: FinanceQueryCall[],
): Promise<QueryResult> {
  const parsed = parseFinanceQuery(table, calls);
  const { db } = await requireFinanceWorkspace();
  let next: unknown = db.from(parsed.table);
  for (const call of parsed.calls) {
    const method = (next as Record<string, (...args: unknown[]) => unknown>)[call.prop];
    if (typeof method !== "function") {
      throw new Error("invalid_query");
    }
    if (call.prop === "select") {
      const columns = call.args[0];
      const options = call.args[1];
      next = method.call(next, columns, options == null ? undefined : options);
    } else {
      next = method.apply(next, call.args);
    }
  }
  return Promise.resolve(next) as Promise<QueryResult>;
}
