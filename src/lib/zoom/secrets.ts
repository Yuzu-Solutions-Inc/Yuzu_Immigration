import { createServiceClient } from "@/lib/supabase/admin";

export type ZoomSecretsPublic = {
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
};

function admin() {
  return createServiceClient();
}

function toIso(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export async function getZoomSecrets(connectionId: string) {
  const { data, error } = await admin().rpc("get_zoom_secrets", {
    p_connection_id: connectionId,
  });
  if (error) {
    console.error("get zoom secrets:", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as {
    refresh_token_encrypted?: string;
    access_token_encrypted?: string | null;
    access_token_expires_at?: string | null;
  };
  if (!row.refresh_token_encrypted) return null;
  return {
    refresh_token_encrypted: row.refresh_token_encrypted,
    access_token_encrypted: row.access_token_encrypted ?? null,
    access_token_expires_at: toIso(row.access_token_expires_at),
  } satisfies ZoomSecretsPublic;
}

export async function upsertZoomSecrets(input: {
  connectionId: string;
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
}) {
  const { error } = await admin().rpc("upsert_zoom_secrets", {
    p_connection_id: input.connectionId,
    p_refresh_token_encrypted: input.refreshTokenEncrypted,
    p_access_token_encrypted: input.accessTokenEncrypted,
    p_access_token_expires_at: input.accessTokenExpiresAt
      ? input.accessTokenExpiresAt.toISOString()
      : null,
  });
  if (error) {
    console.error("upsert zoom secrets:", error.message);
    throw new Error("zoom_secrets_save_failed");
  }
}

export async function updateZoomSecrets(
  connectionId: string,
  patch: {
    accessTokenEncrypted?: string | null;
    accessTokenExpiresAt?: Date | null;
    refreshTokenEncrypted?: string | null;
  },
) {
  const { error } = await admin().rpc("patch_zoom_secrets", {
    p_connection_id: connectionId,
    p_access_token_encrypted: patch.accessTokenEncrypted ?? null,
    p_access_token_expires_at: patch.accessTokenExpiresAt
      ? patch.accessTokenExpiresAt.toISOString()
      : null,
    p_refresh_token_encrypted: patch.refreshTokenEncrypted ?? null,
  });
  if (error) {
    console.error("patch zoom secrets:", error.message);
    throw new Error("zoom_secrets_save_failed");
  }
}
