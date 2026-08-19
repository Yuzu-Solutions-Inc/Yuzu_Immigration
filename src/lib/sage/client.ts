import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

import {
  refreshSageAccessToken,
  sageAccessExpiry,
  SAGE_AAD,
  SAGE_API_BASE,
} from "./oauth";
import { getSageSecrets, upsertSageSecrets } from "./secrets";

export type SageConnectionRow = {
  id: string;
  organization_id: string;
  connected_by: string | null;
  business_id: string;
  business_name: string | null;
  country_id: string | null;
  currency: string;
  customer_contact_type_id: string | null;
  default_ledger_account_id: string | null;
  default_ledger_account_name: string | null;
  is_enabled: boolean;
};

export const SAGE_CONNECTION_SELECT =
  "id, organization_id, connected_by, business_id, business_name, country_id, currency, customer_contact_type_id, default_ledger_account_id, default_ledger_account_name, is_enabled";

type SageListResponse<T> = {
  $items?: T[];
  $next?: string | null;
  $total?: number;
};

const refreshLocks = new Map<string, Promise<string | null>>();

export async function getOrgSageConnection(
  organizationId: string,
): Promise<SageConnectionRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("sage_connections")
    .select(SAGE_CONNECTION_SELECT)
    .eq("organization_id", organizationId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error) {
    console.error("getOrgSageConnection:", error.message);
    return null;
  }
  return (data as SageConnectionRow | null) ?? null;
}

async function persistTokens(
  connection: SageConnectionRow,
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  },
) {
  const dek = await getOrgDataKey(connection.organization_id);
  await upsertSageSecrets({
    connectionId: connection.id,
    accessTokenEncrypted: encryptField(
      tokens.access_token,
      SAGE_AAD.accessToken,
      dek,
    ),
    refreshTokenEncrypted: encryptField(
      tokens.refresh_token,
      SAGE_AAD.refreshToken,
      dek,
    ),
    accessTokenExpiresAt: sageAccessExpiry(tokens),
  });
}

async function refreshSageConnection(
  connection: SageConnectionRow,
): Promise<string | null> {
  const existing = refreshLocks.get(connection.id);
  if (existing) return existing;

  const pending = (async () => {
    const secrets = await getSageSecrets(connection.id);
    if (!secrets) return null;
    const dek = await getOrgDataKey(connection.organization_id);
    const refreshToken = decryptField(
      secrets.refresh_token_encrypted,
      SAGE_AAD.refreshToken,
      dek,
    );
    try {
      const tokens = await refreshSageAccessToken(refreshToken);
      if (!tokens.access_token || !tokens.refresh_token) return null;
      await persistTokens(connection, tokens);
      return tokens.access_token;
    } catch (error) {
      console.error("sage refresh failed:", error);
      return null;
    } finally {
      refreshLocks.delete(connection.id);
    }
  })();

  refreshLocks.set(connection.id, pending);
  return pending;
}

export async function getValidSageAccessToken(
  connection: SageConnectionRow,
): Promise<string | null> {
  const secrets = await getSageSecrets(connection.id);
  if (!secrets) return null;
  const dek = await getOrgDataKey(connection.organization_id);
  const accessToken = decryptField(
    secrets.access_token_encrypted,
    SAGE_AAD.accessToken,
    dek,
  );
  const expiresAt = secrets.access_token_expires_at
    ? Date.parse(secrets.access_token_expires_at)
    : 0;
  if (expiresAt > Date.now() + 20_000) {
    return accessToken;
  }
  return refreshSageConnection(connection);
}

export type SageApiResult = {
  ok: boolean;
  status: number;
  json: unknown;
};

export async function sageFetch(
  connection: SageConnectionRow,
  path: string,
  init?: RequestInit,
): Promise<SageApiResult> {
  const accessToken = await getValidSageAccessToken(connection);
  if (!accessToken) {
    return { ok: false, status: 401, json: { error: "sage_token_unavailable" } };
  }

  const url = path.startsWith("http")
    ? path
    : `${SAGE_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const run = async (token: string) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Business": connection.business_id,
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { ok: response.ok, status: response.status, json };
  };

  let result = await run(accessToken);
  if (result.status === 401) {
    const refreshed = await refreshSageConnection(connection);
    if (refreshed) result = await run(refreshed);
  }
  return result;
}

export async function sageFetchJson<T>(
  connection: SageConnectionRow,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const result = await sageFetch(connection, path, init);
  if (!result.ok) {
    console.error("sageFetchJson:", path, result.status, result.json);
    throw new Error(`sage_api:${result.status}`);
  }
  return result.json as T;
}

function withListParams(path: string) {
  const hasQuery = path.includes("?");
  const params: string[] = [];
  if (!path.includes("items_per_page")) params.push("items_per_page=200");
  if (!path.includes("attributes=")) params.push("attributes=all");
  if (params.length === 0) return path;
  return `${path}${hasQuery ? "&" : "?"}${params.join("&")}`;
}

export async function sageListAll<T>(
  connection: SageConnectionRow,
  path: string,
): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = withListParams(path);

  for (let page = 0; page < 25 && next; page += 1) {
    const data = (await sageFetchJson(
      connection,
      next,
    )) as SageListResponse<T>;
    const pageItems = data.$items ?? [];
    items.push(...pageItems);
    const rawNext: string | null = data.$next ?? null;
    next = rawNext ? rawNext.replace(SAGE_API_BASE, "") : null;
    if (pageItems.length === 0) break;
  }
  return items;
}

export type SageBusiness = {
  id?: string;
  displayed_as?: string;
  name?: string;
  country?: { id?: string; displayed_as?: string };
  currency?: { id?: string };
};

export async function listSageBusinesses(accessToken: string) {
  const response = await fetch(`${SAGE_API_BASE}/businesses`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = (await response.json()) as SageListResponse<SageBusiness>;
  if (!response.ok) {
    throw new Error(`sage_businesses:${response.status}`);
  }
  return json.$items ?? [];
}

export function pickSageBusiness(businesses: SageBusiness[]) {
  if (businesses.length === 0) return null;
  const canada = businesses.find((row) => {
    const id = row.country?.id?.toUpperCase();
    return id === "CA" || id === "CAN";
  });
  return canada ?? businesses[0];
}

export type SageRef = {
  id?: string;
  displayed_as?: string;
};

export type SageContactType = SageRef & { name?: string };

export type SageTaxRate = SageRef & {
  name?: string;
  percentage?: string | number;
  is_visible?: boolean;
};

export type SageLedgerAccount = SageRef & {
  nominal_code?: string;
  visible_in_sales?: boolean;
  ledger_account_type?: SageRef;
};

export type SageAddress = {
  id?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country_id?: string;
  country?: SageRef;
};

export type SageContactPerson = {
  id?: string;
  name?: string;
  email?: string;
  telephone?: string;
  mobile?: string;
};

export type SageContact = SageRef & {
  name?: string;
  email?: string;
  telephone?: string;
  mobile?: string;
  contact_types?: SageRef[];
  main_contact?: SageContactPerson;
  main_address?: SageAddress;
};

export function sageRefId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value) {
    const id = (value as SageRef).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export function parseSagePercent(value: string | number | null | undefined) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}
