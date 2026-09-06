import type { SupabaseClient } from "@supabase/supabase-js";

import {
  openFinanceResultAction,
  sealFinanceValuesAction,
} from "@/app/actions/finance-crypto";
import type { FinanceQueryCall } from "@/lib/finance/query-calls";

type OrgRow = Record<string, unknown>;

function withOrg<T>(values: T, orgId: string): T {
  if (Array.isArray(values)) {
    return values.map((row) => ({ ...(row as object), organization_id: orgId })) as T;
  }
  return { ...(values as object), organization_id: orgId } as T;
}

export type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
  status?: number;
  statusText?: string;
};

function isQueryResult(value: unknown): value is QueryResult {
  return Boolean(value) && typeof value === "object" && "data" in (value as object);
}

export type FinanceDbCrypto = {
  openRead: (table: string, result: QueryResult) => Promise<QueryResult>;
  seal: (table: string, values: unknown) => Promise<unknown>;
  /** When set, select chains run here instead of on this supabase client. */
  runRead?: (table: string, calls: FinanceQueryCall[]) => Promise<QueryResult>;
};

const defaultCrypto: FinanceDbCrypto = {
  openRead: (table, result) => openFinanceResultAction(table, result),
  seal: (table, values) => sealFinanceValuesAction(table, values),
};

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
  openRead: (table: string, result: QueryResult) => Promise<QueryResult>,
  calls: FinanceQueryCall[] = [],
): object {
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
                if (isQueryResult(result)) return openRead(table, result);
                return result;
              })
              .then(resolve, reject);
        }
        return (...args: unknown[]) =>
          wrapSealedBuilder(table, builderPromise, openRead, [
            ...calls,
            { prop: String(prop), args },
          ]);
      },
    },
  );
}

function wrapRecordedRead(
  table: string,
  calls: FinanceQueryCall[],
  runRead: (table: string, calls: FinanceQueryCall[]) => Promise<QueryResult>,
): object {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
            runRead(table, calls).then(resolve, reject);
        }
        return (...args: unknown[]) =>
          wrapRecordedRead(
            table,
            [...calls, { prop: String(prop), args }],
            runRead,
          );
      },
    },
  );
}

/**
 * Org-scoped table access. RLS still allows every org the user belongs to;
 * this filter is the active-workspace UX. PII columns are sealed with the org
 * DEK on write and opened on read (inline on the server, via a query action
 * from the browser).
 */
export function createFinanceDb(
  supabase: SupabaseClient,
  orgId: string,
  hooks: Partial<FinanceDbCrypto> = {},
) {
  const openRead = hooks.openRead ?? defaultCrypto.openRead;
  const seal = hooks.seal ?? defaultCrypto.seal;
  const runRead = hooks.runRead;
  return {
    orgId,
    supabase,
    from<Table extends string>(table: Table) {
      const q = supabase.from(table);
      return {
        select: ((columns?: string, options?: object) => {
          if (runRead) {
            return wrapRecordedRead(
              table,
              [{ prop: "select", args: options == null ? [columns ?? "*"] : [columns ?? "*", options] }],
              runRead,
            );
          }
          return wrapBuilder(
            table,
            q
              .select((columns ?? "*") as "*", options as never)
              .eq("organization_id", orgId),
            (result) => openRead(table, result),
          );
        }) as typeof q.select,
        insert: ((values: OrgRow | OrgRow[], options?: object) =>
          wrapSealedBuilder(
            table,
            seal(table, withOrg(values, orgId)).then(
              (sealed) => q.insert(sealed as never, options as never) as object,
            ),
            openRead,
          )) as typeof q.insert,
        update: ((values: object, options?: object) =>
          wrapSealedBuilder(
            table,
            seal(table, values).then(
              (sealed) =>
                q
                  .update(sealed as never, options as never)
                  .eq("organization_id", orgId) as object,
            ),
            openRead,
          )) as typeof q.update,
        upsert: ((values: OrgRow | OrgRow[], options?: object) =>
          wrapSealedBuilder(
            table,
            seal(table, withOrg(values, orgId)).then(
              (sealed) => q.upsert(sealed as never, options as never) as object,
            ),
            openRead,
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
