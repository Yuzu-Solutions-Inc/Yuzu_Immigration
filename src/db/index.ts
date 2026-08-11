import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as {
  pg?: ReturnType<typeof postgres>;
};

export function getDb() {
  const connectionString = requireDatabaseUrl();
  const client =
    globalForDb.pg ??
    postgres(connectionString, {
      prepare: false,
      max: 10,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pg = client;
  }

  return drizzle(client, { schema });
}
