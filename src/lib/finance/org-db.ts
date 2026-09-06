import type { SupabaseClient } from "@supabase/supabase-js";

import {
  openFinanceResultAction,
  sealFinanceValuesAction,
} from "@/app/actions/finance-crypto";

type OrgRow = Record<string, unknown>;

function withOrg<T>(values: T, orgId: string): T {
  if (Array.isArray(values)) {
    return values.map((row) => ({ ...(row as object), organization_id: orgId })) as T;
  }
  return { ...(values as object), organization_id: orgId } as T;
}

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

function isQueryResult(value: unknown): value is QueryResult {
  return Boolean(value) && typeof value === "object" && "data" in (value as object);
}

function wrapBuilder(
  table: string,
  builder: object,
  onResolve: (result: QueryResult) => Promise<QueryResult>,
): object {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
          Promise.resolve(target)
            .then(async (result) => {
              if (isQueryResult(result)) return onResolve(result);
              return result;
            })
            .then(resolve, reject);
      }
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const out = (value as (...inner: unknown[]) => unknown).apply(target, args);
          if (out && typeof out === "object") {
            return wrapBuilder(table, out as object, onResolve);
          }
          return out;
        };
      }
      return value;
    },
  });
}

function wrapSealedBuilder(
  table: string,
  builderPromise: Promise<object>,
  calls: { prop: string; args: unknown[] }[] = [],
): object {
  const open = (result: QueryResult) => openFinanceResultAction(table, result);
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
            builderPromise
              .then((builder) => {
                let next: unknown = builder;
                for (const call of calls) {
                  const method = (next as Record<string, (...inner: unknown[]) => unknown>)[
                    call.prop
                  ];
                  next = method(...call.args);
                }
                return Promise.resolve(next);
              })
              .then(async (result) => {
                if (isQueryResult(result)) return open(result);
                return result;
              })
              .then(resolve, reject);
        }
        return (...args: unknown[]) =>
          wrapSealedBuilder(table, builderPromise, [
            ...calls,
            { prop: String(prop), args },
          ]);
      },
    },
  );
}

/**
 * Org-scoped table access. RLS still allows every org the user belongs to;
 * this filter is the active-workspace UX. PII columns are sealed with the org
 * DEK on write and opened on read (via a server action).
 */
export function createFinanceDb(supabase: SupabaseClient, orgId: string) {
  const openRead = (table: string) => (result: QueryResult) =>
    openFinanceResultAction(table, result);

  return {
    orgId,
    supabase,
    from<Table extends string>(table: Table) {
      const q = supabase.from(table);
      return {
        select: ((columns?: string, options?: object) =>
          wrapBuilder(
            table,
            q
              .select((columns ?? "*") as "*", options as never)
              .eq("organization_id", orgId),
            openRead(table),
          )) as typeof q.select,
        insert: ((values: OrgRow | OrgRow[], options?: object) =>
          wrapSealedBuilder(
            table,
            sealFinanceValuesAction(table, withOrg(values, orgId)).then(
              (sealed) => q.insert(sealed as never, options as never) as object,
            ),
          )) as typeof q.insert,
        update: ((values: object, options?: object) =>
          wrapSealedBuilder(
            table,
            sealFinanceValuesAction(table, values).then(
              (sealed) =>
                q
                  .update(sealed as never, options as never)
                  .eq("organization_id", orgId) as object,
            ),
          )) as typeof q.update,
        upsert: ((values: OrgRow | OrgRow[], options?: object) =>
          wrapSealedBuilder(
            table,
            sealFinanceValuesAction(table, withOrg(values, orgId)).then(
              (sealed) => q.upsert(sealed as never, options as never) as object,
            ),
          )) as typeof q.upsert,
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
