import { getBoundFinanceDb } from "./org-db";

/** Storage / RPC access for the bound Finance workspace (client pages). */
export const supabase = new Proxy(
  {} as ReturnType<typeof getBoundFinanceDb>["supabase"],
  {
    get(_target, prop, receiver) {
      return Reflect.get(getBoundFinanceDb().supabase, prop, receiver);
    },
  },
);
