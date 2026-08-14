import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { googleCalendarSecrets } from "@/db/schema";

export type GoogleCalendarSecretsRow = {
  connectionId: string;
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  syncToken: string | null;
  channelTokenEncrypted: string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export async function getGoogleCalendarSecrets(connectionId: string) {
  const [row] = await getDb()
    .select()
    .from(googleCalendarSecrets)
    .where(eq(googleCalendarSecrets.connectionId, connectionId))
    .limit(1);
  if (!row) return null;
  return {
    refresh_token_encrypted: row.refreshTokenEncrypted,
    access_token_encrypted: row.accessTokenEncrypted,
    access_token_expires_at: toIso(row.accessTokenExpiresAt),
    sync_token: row.syncToken,
    channel_token_encrypted: row.channelTokenEncrypted,
  };
}

export async function upsertGoogleCalendarSecrets(input: {
  connectionId: string;
  refreshTokenEncrypted: string;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  syncToken?: string | null;
}) {
  await getDb()
    .insert(googleCalendarSecrets)
    .values({
      connectionId: input.connectionId,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      accessTokenEncrypted: input.accessTokenEncrypted,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      syncToken: input.syncToken ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: googleCalendarSecrets.connectionId,
      set: {
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        accessTokenEncrypted: input.accessTokenEncrypted,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        syncToken: input.syncToken ?? null,
        updatedAt: new Date(),
      },
    });
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
  await getDb()
    .update(googleCalendarSecrets)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarSecrets.connectionId, connectionId));
}
