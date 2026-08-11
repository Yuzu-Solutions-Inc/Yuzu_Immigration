import { headers } from "next/headers";

import { env } from "@/lib/env";

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
 *
 * Server-only: uses next/headers. Do not import from client components.
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
