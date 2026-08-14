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
      `${origin}/${locale}/calendar?google=${encodeURIComponent(reason)}`,
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
  const role = membership?.role as string | undefined;
  if (role !== "admin" && role !== "consultant") {
    return fail("forbidden");
  }

  try {
    const tokens = await exchangeGoogleCode({ origin, code });
    const email = await googleUserEmail(tokens.access_token);

    const { data: existing } = await admin
      .from("google_calendar_connections")
      .select("id")
      .eq("organization_id", state.organizationId)
      .maybeSingle();

    let connectionId = existing?.id as string | undefined;
    if (connectionId) {
      await admin
        .from("google_calendar_connections")
        .update({
          user_id: user.id,
          google_email: email,
          calendar_id: "primary",
          is_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
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

    const { data: existingSecrets } = await admin
      .schema("private")
      .from("google_calendar_secrets")
      .select("refresh_token_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();

    const refreshToken = tokens.refresh_token;
    if (!refreshToken && !existingSecrets?.refresh_token_encrypted) {
      return fail("no_refresh");
    }

    await admin.schema("private").from("google_calendar_secrets").upsert({
      connection_id: connectionId,
      refresh_token_encrypted: refreshToken
        ? encryptField(refreshToken, GOOGLE_CALENDAR_AAD.refreshToken)
        : existingSecrets!.refresh_token_encrypted,
      access_token_encrypted: encryptField(
        tokens.access_token,
        GOOGLE_CALENDAR_AAD.accessToken,
      ),
      access_token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      sync_token: null,
      updated_at: new Date().toISOString(),
    });

    const { data: connection } = await admin
      .from("google_calendar_connections")
      .select("*")
      .eq("id", connectionId)
      .single();

    if (connection) {
      const row = connection as GoogleCalendarConnectionRow;
      await syncGoogleBusy(row);
      const appUrl = await getAppBaseUrl();
      if (appUrl.startsWith("https://")) {
        await startGoogleWatch(row, `${appUrl}/api/calendar/google/webhook`);
      }
    }

    return NextResponse.redirect(`${origin}/${locale}/calendar?google=connected`);
  } catch (error) {
    console.error("google calendar callback:", error);
    return fail("callback_failed");
  }
}
