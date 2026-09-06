import { NextResponse } from "next/server";

import {
  applyMeetingProvider,
  calendarSettingsHref,
} from "@/lib/booking/integrations";
import { encryptOrgRow } from "@/lib/security/encrypted-fields";
import { encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  decodeZoomOAuthState,
  exchangeZoomCode,
  zoomUserProfile,
  ZOOM_AAD,
} from "@/lib/zoom/oauth";
import { getZoomSecrets, upsertZoomSecrets } from "@/lib/zoom/secrets";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const state = stateRaw ? decodeZoomOAuthState(stateRaw) : null;
  const locale = state?.locale ?? "en";
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}${calendarSettingsHref(locale, { zoom: reason })}`,
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
    const tokens = await exchangeZoomCode({
      origin: redirectOrigin,
      code,
    });
    const profile = await zoomUserProfile(tokens.access_token);
    const orgKey = await getOrgDataKey(state.organizationId);
    const sealedEmail = encryptOrgRow(
      "zoom_connections",
      { zoom_email: profile?.email ?? null },
      orgKey,
    ).zoom_email;

    const { data: existing, error: existingError } = await admin
      .from("zoom_connections")
      .select("id")
      .eq("organization_id", state.organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) {
      console.error("zoom connect read:", existingError.message);
      return fail("save_failed");
    }

    let connectionId = existing?.id as string | undefined;
    if (connectionId) {
      const { error: updateError } = await admin
        .from("zoom_connections")
        .update({
          user_id: user.id,
          zoom_email: sealedEmail,
          zoom_user_id: profile?.zoomUserId ?? null,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (updateError) {
        console.error("zoom connect update:", updateError.message);
        return fail("save_failed");
      }
    } else {
      const inserted = await admin
        .from("zoom_connections")
        .insert({
          organization_id: state.organizationId,
          user_id: user.id,
          zoom_email: sealedEmail,
          zoom_user_id: profile?.zoomUserId ?? null,
          is_enabled: true,
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) {
        console.error("zoom connect insert:", inserted.error?.message);
        return fail("save_failed");
      }
      connectionId = inserted.data.id as string;
    }

    const existingSecrets = await getZoomSecrets(connectionId);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken && !existingSecrets?.refresh_token_encrypted) {
      return fail("no_refresh");
    }

    const dek = await getOrgDataKey(state.organizationId);
    await upsertZoomSecrets({
      connectionId,
      refreshTokenEncrypted: refreshToken
        ? encryptField(refreshToken, ZOOM_AAD.refreshToken, dek)
        : existingSecrets!.refresh_token_encrypted,
      accessTokenEncrypted: encryptField(
        tokens.access_token,
        ZOOM_AAD.accessToken,
        dek,
      ),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });
    const savedSecrets = await getZoomSecrets(connectionId);
    if (!savedSecrets) {
      return fail("save_failed");
    }

    await applyMeetingProvider({
      organizationId: state.organizationId,
      userId: user.id,
      meeting: "zoom",
    });

    return NextResponse.redirect(
      `${origin}${calendarSettingsHref(locale, { zoom: "connected" })}`,
    );
  } catch (error) {
    console.error("zoom callback:", error);
    return fail("callback_failed");
  }
}
