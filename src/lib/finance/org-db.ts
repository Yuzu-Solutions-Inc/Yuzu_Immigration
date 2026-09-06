import type { SupabaseClient } from "@supabase/supabase-js";

type OrgRow = Record<string, unknown>;

function withOrg<T>(values: T, orgId: string): T {
  if (Array.isArray(values)) {
    return values.map((row) => ({ ...(row as object), organization_id: orgId })) as T;
  }
  return { ...(values as object), organization_id: orgId } as T;
}

/**
 * Org-scoped table access. RLS still allows every org the user belongs to;
 * this filter is the active-workspace UX.
 */
export function createFinanceDb(supabase: SupabaseClient, orgId: string) {
  return {
    orgId,
    supabase,
    from<Table extends string>(table: Table) {
      const q = supabase.from(table);
      return {
        select: ((columns?: string, options?: object) =>
          q
            .select((columns ?? "*") as "*", options as never)
            .eq("organization_id", orgId)) as typeof q.select,
        insert: ((values: OrgRow | OrgRow[], options?: object) =>
          q.insert(withOrg(values, orgId) as never, options as never)) as typeof q.insert,
        update: ((values: object, options?: object) =>
          q
            .update(values as never, options as never)
            .eq("organization_id", orgId)) as typeof q.update,
        upsert: ((values: OrgRow | OrgRow[], options?: object) =>
          q.upsert(withOrg(values, orgId) as never, options as never)) as typeof q.upsert,
        delete: (() =>
          q.delete().eq("organization_id", orgId)) as typeof q.delete,
      };
    },
  };
}

export type FinanceDb = ReturnType<typeof createFinanceDb>;

let bound: FinanceDb | null = null;

export function bindFinanceDb(next: FinanceDb | null) {
  bound = next;
}

export function getBoundFinanceDb(): FinanceDb {
  if (!bound) {
    throw new Error("Finance database is not bound to an organization.");
  }
  return bound;
}

/** Client-page compatibility with the Vite `db.from(...)` helper. */
export const db: FinanceDb = new Proxy({} as FinanceDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getBoundFinanceDb(), prop, receiver);
  },
});
