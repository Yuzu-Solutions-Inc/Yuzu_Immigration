import { NextResponse } from "next/server";

import {
  applyIntegrationIntent,
  calendarSettingsHref,
  parseIntegrationIntent,
} from "@/lib/booking/integrations";
import { applyCalendarProviderWatches } from "@/lib/calendar/staff-watches";
import {
  decodeMicrosoftOAuthState,
  exchangeMicrosoftCode,
  microsoftUserEmail,
  MICROSOFT_CALENDAR_AAD,
} from "@/lib/microsoft/oauth";
import {
  getMicrosoftCalendarSecrets,
  upsertMicrosoftCalendarSecrets,
} from "@/lib/microsoft/secrets";
import { encryptOrgRow } from "@/lib/security/encrypted-fields";
import { encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const state = stateRaw ? decodeMicrosoftOAuthState(stateRaw) : null;
  const locale = state?.locale ?? "en";
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}${calendarSettingsHref(locale, { microsoft: reason })}`,
    );

  if (errorParam || !code || !state) {
    return fail("denied");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) {
    return fail("unauthorized");
  }

  const admin = createServiceClient();
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", state.organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return fail("forbidden");
  }

  try {
    const redirectOrigin = state.origin || origin;
    const tokens = await exchangeMicrosoftCode({
      origin: redirectOrigin,
      code,
    });
    const email = await microsoftUserEmail(tokens.access_token);
    const orgKey = await getOrgDataKey(state.organizationId);
    const sealedEmail = encryptOrgRow(
      "microsoft_calendar_connections",
      { microsoft_email: email },
      orgKey,
    ).microsoft_email;

    const { data: existing, error: existingError } = await admin
      .from("microsoft_calendar_connections")
      .select("id")
      .eq("organization_id", state.organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) {
      console.error("microsoft connect read:", existingError.message);
      return fail("save_failed");
    }

    let connectionId = existing?.id as string | undefined;
    if (connectionId) {
      const { error: updateError } = await admin
        .from("microsoft_calendar_connections")
        .update({
          user_id: user.id,
          microsoft_email: sealedEmail,
          calendar_id: "calendar",
          is_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (updateError) {
        console.error("microsoft connect update:", updateError.message);
        return fail("save_failed");
      }
    } else {
      const inserted = await admin
        .from("microsoft_calendar_connections")
        .insert({
          organization_id: state.organizationId,
          user_id: user.id,
          microsoft_email: sealedEmail,
          calendar_id: "calendar",
          is_enabled: true,
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) {
        console.error("microsoft connect insert:", inserted.error?.message);
        return fail("save_failed");
      }
      connectionId = inserted.data.id as string;
    }

    const existingSecrets = await getMicrosoftCalendarSecrets(connectionId);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken && !existingSecrets?.refresh_token_encrypted) {
      return fail("no_refresh");
    }

    const dek = await getOrgDataKey(state.organizationId);
    await upsertMicrosoftCalendarSecrets({
      connectionId,
      refreshTokenEncrypted: refreshToken
        ? encryptField(refreshToken, MICROSOFT_CALENDAR_AAD.refreshToken, dek)
        : existingSecrets!.refresh_token_encrypted,
      accessTokenEncrypted: encryptField(
        tokens.access_token,
        MICROSOFT_CALENDAR_AAD.accessToken,
        dek,
      ),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      syncToken: null,
    });
    const savedSecrets = await getMicrosoftCalendarSecrets(connectionId);
    if (!savedSecrets) {
      return fail("save_failed");
    }

    await applyIntegrationIntent({
      organizationId: state.organizationId,
      userId: user.id,
      vendor: "microsoft",
      intent: parseIntegrationIntent(state.intent),
    });
    await applyCalendarProviderWatches(state.organizationId, user.id);

    return NextResponse.redirect(
      `${origin}${calendarSettingsHref(locale, { microsoft: "connected" })}`,
    );
  } catch (error) {
    console.error("microsoft calendar callback:", error);
    return fail("callback_failed");
  }
}
