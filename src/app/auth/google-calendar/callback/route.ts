import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  startGoogleWatch,
  syncGoogleBusy,
  type GoogleCalendarConnectionRow,
} from "@/lib/google/calendar";
import {
  decodeGoogleOAuthState,
  exchangeGoogleCode,
  googleUserEmail,
} from "@/lib/google/oauth";
import { GOOGLE_CALENDAR_AAD } from "@/lib/google/oauth";
import { getGoogleCalendarSecrets, upsertGoogleCalendarSecrets } from "@/lib/google/secrets";
import { encryptField } from "@/lib/security/field-crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const state = stateRaw ? decodeGoogleOAuthState(stateRaw) : null;
  const locale = state?.locale ?? "en";
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/${locale}/calendar/settings?google=${encodeURIComponent(reason)}`,
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
    const tokens = await exchangeGoogleCode({ origin: redirectOrigin, code });
    const email = await googleUserEmail(tokens.access_token);

    const { data: existing, error: existingError } = await admin
      .from("google_calendar_connections")
      .select("id")
      .eq("organization_id", state.organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) {
      console.error("google connect read:", existingError.message);
      return fail("save_failed");
    }

    let connectionId = existing?.id as string | undefined;
    if (connectionId) {
      const { error: updateError } = await admin
        .from("google_calendar_connections")
        .update({
          user_id: user.id,
          google_email: email,
          calendar_id: "primary",
          is_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (updateError) {
        console.error("google connect update:", updateError.message);
        return fail("save_failed");
      }
    } else {
      const inserted = await admin
        .from("google_calendar_connections")
        .insert({
          organization_id: state.organizationId,
          user_id: user.id,
          google_email: email,
          calendar_id: "primary",
          is_enabled: true,
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) {
        console.error("google connect insert:", inserted.error?.message);
        return fail("save_failed");
      }
      connectionId = inserted.data.id as string;
    }

    const existingSecrets = await getGoogleCalendarSecrets(connectionId);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken && !existingSecrets?.refresh_token_encrypted) {
      return fail("no_refresh");
    }

    await upsertGoogleCalendarSecrets({
      connectionId,
      refreshTokenEncrypted: refreshToken
        ? encryptField(refreshToken, GOOGLE_CALENDAR_AAD.refreshToken)
        : existingSecrets!.refresh_token_encrypted,
      accessTokenEncrypted: encryptField(
        tokens.access_token,
        GOOGLE_CALENDAR_AAD.accessToken,
      ),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      syncToken: null,
    });
    const savedSecrets = await getGoogleCalendarSecrets(connectionId);
    if (!savedSecrets) {
      return fail("save_failed");
    }

    const { data: connection } = await admin
      .from("google_calendar_connections")
      .select("*")
      .eq("id", connectionId)
      .single();

    if (connection) {
      const row = connection as GoogleCalendarConnectionRow;
      try {
        await syncGoogleBusy(row);
      } catch (error) {
        console.error("google initial sync:", error);
      }
      const appUrl = await getAppBaseUrl();
      if (appUrl.startsWith("https://")) {
        try {
          await startGoogleWatch(row, `${appUrl}/api/calendar/google/webhook`);
        } catch (error) {
          console.error("google initial watch:", error);
        }
      }
    }

    await admin
      .from("booking_settings")
      .update({
        default_host_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", state.organizationId)
      .is("default_host_user_id", null);

    return NextResponse.redirect(`${origin}/${locale}/calendar/settings?google=connected`);
  } catch (error) {
    console.error("google calendar callback:", error);
    return fail("callback_failed");
  }
}
