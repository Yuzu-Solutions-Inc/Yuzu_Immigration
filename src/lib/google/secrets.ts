import { createServiceClient } from "@/lib/supabase/admin";

export type GoogleCalendarSecretsPublic = {
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  sync_token: string | null;
  channel_token_encrypted: string | null;
};

function admin() {
  return createServiceClient();
}

function toIso(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export async function getGoogleCalendarSecrets(connectionId: string) {
  const { data, error } = await admin().rpc("get_google_calendar_secrets", {
    p_connection_id: connectionId,
  });
  if (error) {
    console.error("get google secrets:", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as {
    refresh_token_encrypted?: string;
    access_token_encrypted?: string | null;
    access_token_expires_at?: string | null;
    sync_token?: string | null;
    channel_token_encrypted?: string | null;
  };
  if (!row.refresh_token_encrypted) return null;
  return {
    refresh_token_encrypted: row.refresh_token_encrypted,
    access_token_encrypted: row.access_token_encrypted ?? null,
    access_token_expires_at: toIso(row.access_token_expires_at),
    sync_token: row.sync_token ?? null,
    channel_token_encrypted: row.channel_token_encrypted ?? null,
  } satisfies GoogleCalendarSecretsPublic;
}

export async function upsertGoogleCalendarSecrets(input: {
  connectionId: string;
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  syncToken?: string | null;
}) {
  const { error } = await admin().rpc("upsert_google_calendar_secrets", {
    p_connection_id: input.connectionId,
    p_refresh_token_encrypted: input.refreshTokenEncrypted,
    p_access_token_encrypted: input.accessTokenEncrypted,
    p_access_token_expires_at: input.accessTokenExpiresAt
      ? input.accessTokenExpiresAt.toISOString()
      : null,
    p_sync_token: input.syncToken ?? null,
  });
  if (error) {
    console.error("upsert google secrets:", error.message);
    throw new Error("google_secrets_save_failed");
  }
}

export async function updateGoogleCalendarSecrets(
  connectionId: string,
  patch: {
    accessTokenEncrypted?: string | null;
    accessTokenExpiresAt?: Date | null;
    syncToken?: string | null;
    channelTokenEncrypted?: string | null;
  },
) {
  const { error } = await admin().rpc("patch_google_calendar_secrets", {
    p_connection_id: connectionId,
    p_access_token_encrypted: patch.accessTokenEncrypted ?? null,
    p_access_token_expires_at: patch.accessTokenExpiresAt
      ? patch.accessTokenExpiresAt.toISOString()
      : null,
    p_sync_token: patch.syncToken ?? null,
    p_set_sync_token: Object.prototype.hasOwnProperty.call(patch, "syncToken"),
    p_channel_token_encrypted: patch.channelTokenEncrypted ?? null,
  });
  if (error) {
    console.error("patch google secrets:", error.message);
    throw new Error("google_secrets_save_failed");
  }
}
