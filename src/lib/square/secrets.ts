import { createServiceClient } from "@/lib/supabase/admin";

export type SquareSecretsPublic = {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string | null;
};

function admin() {
  return createServiceClient();
}

function toIso(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export async function getSquareSecrets(connectionId: string) {
  const { data, error } = await admin().rpc("get_square_secrets", {
    p_connection_id: connectionId,
  });
  if (error) {
    console.error("get square secrets:", error.message);
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
  } satisfies SquareSecretsPublic;
}

export async function upsertSquareSecrets(input: {
  connectionId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: Date | null;
}) {
  const { error } = await admin().rpc("upsert_square_secrets", {
    p_connection_id: input.connectionId,
    p_access_token_encrypted: input.accessTokenEncrypted,
    p_refresh_token_encrypted: input.refreshTokenEncrypted,
    p_access_token_expires_at: input.accessTokenExpiresAt
      ? input.accessTokenExpiresAt.toISOString()
      : null,
  });
  if (error) {
    console.error("upsert square secrets:", error.message);
    throw new Error("square_secrets_save_failed");
  }
}

export async function patchSquareSecrets(
  connectionId: string,
  patch: {
    accessTokenEncrypted: string;
    accessTokenExpiresAt: Date | null;
  },
) {
  const { error } = await admin().rpc("patch_square_secrets", {
    p_connection_id: connectionId,
    p_access_token_encrypted: patch.accessTokenEncrypted,
    p_access_token_expires_at: patch.accessTokenExpiresAt
      ? patch.accessTokenExpiresAt.toISOString()
      : null,
  });
  if (error) {
    console.error("patch square secrets:", error.message);
    throw new Error("square_secrets_save_failed");
  }
}
