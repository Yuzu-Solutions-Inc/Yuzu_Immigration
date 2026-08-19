import { createServiceClient } from "@/lib/supabase/admin";

export type SageSecretsPublic = {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string | null;
};

function toIso(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export async function getSageSecrets(connectionId: string) {
  const { data, error } = await createServiceClient().rpc("get_sage_secrets", {
    p_connection_id: connectionId,
  });
  if (error) {
    console.error("get sage secrets:", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as {
    access_token_encrypted?: string;
    refresh_token_encrypted?: string;
    access_token_expires_at?: string | null;
  };
  if (!row.access_token_encrypted || !row.refresh_token_encrypted) return null;
  return {
    access_token_encrypted: row.access_token_encrypted,
    refresh_token_encrypted: row.refresh_token_encrypted,
    access_token_expires_at: toIso(row.access_token_expires_at),
  } satisfies SageSecretsPublic;
}

export async function upsertSageSecrets(input: {
  connectionId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: Date | null;
}) {
  const { error } = await createServiceClient().rpc("upsert_sage_secrets", {
    p_connection_id: input.connectionId,
    p_access_token_encrypted: input.accessTokenEncrypted,
    p_refresh_token_encrypted: input.refreshTokenEncrypted,
    p_access_token_expires_at: input.accessTokenExpiresAt
      ? input.accessTokenExpiresAt.toISOString()
      : null,
  });
  if (error) {
    console.error("upsert sage secrets:", error.message);
    throw new Error("sage_secrets_save_failed");
  }
}
