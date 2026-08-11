import { headers } from "next/headers";
import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_DEFAULT_LOCALE: z.preprocess(
    emptyToUndefined,
    z.enum(["en", "fr", "es"]).default("en"),
  ),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  DATABASE_URL: optionalSecret,
  DIRECT_DATABASE_URL: optionalSecret,
});

export type ServerEnv = z.infer<typeof serverSchema>;

function readEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  return parsed.data;
}

export const env = readEnv();

function isLocalhostUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Public site origin for share links / redirects.
 * Prefer a non-localhost NEXT_PUBLIC_APP_URL, then the current request host,
 * then Vercel URL, then localhost for local dev.
 */
export async function getAppBaseUrl(): Promise<string> {
  const configured = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured && !isLocalhostUrl(configured)) {
    return configured;
  }

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (isLocalhostUrl(`http://${host}`) ? "http" : "https");
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    // headers() unavailable outside a request
  }

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  return configured || "http://localhost:3000";
}

export function requireSupabasePublicEnv() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function requireDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in .env.local");
  }
  return env.DATABASE_URL;
}
