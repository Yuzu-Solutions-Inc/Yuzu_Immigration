import "server-only";

import { z } from "zod";

import { publicEnv, type PublicEnv } from "@/lib/public-env";

/**
 * Server-only env. Do not import from client components or `@/lib/supabase/client`.
 * Public `NEXT_PUBLIC_*` values live in `@/lib/public-env`.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const secretSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  /** 64 hex chars — wrap key for per-org DEKs (client data uses the org key). */
  DOCUMENT_ENCRYPTION_KEY: optionalSecret,
  DATABASE_URL: optionalSecret,
  DIRECT_DATABASE_URL: optionalSecret,
});

export type ServerEnv = PublicEnv & z.infer<typeof secretSchema>;

function readSecrets(): z.infer<typeof secretSchema> {
  const parsed = secretSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DOCUMENT_ENCRYPTION_KEY: process.env.DOCUMENT_ENCRYPTION_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  return parsed.data;
}

export const env: ServerEnv = {
  ...publicEnv,
  ...readSecrets(),
};

export function requireDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in .env.local");
  }
  return env.DATABASE_URL;
}
