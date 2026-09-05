import { NextResponse } from "next/server";

import { persistSquareConnection } from "@/app/actions/square";
import { canAdministerOrg } from "@/lib/auth/rbac";
import {
  decodeSquareOAuthState,
  exchangeSquareCode,
} from "@/lib/square/oauth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const state = stateRaw ? decodeSquareOAuthState(stateRaw) : null;
  const locale = state?.locale ?? "en";
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/${locale}/settings/payments?square=${encodeURIComponent(reason)}`,
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

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", state.organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !canAdministerOrg(membership.role)) {
    return fail("forbidden");
  }

  try {
    const redirectOrigin = state.origin || origin;
    const tokens = await exchangeSquareCode({
      origin: redirectOrigin,
      code,
    });
    if (!tokens.access_token || !tokens.refresh_token || !tokens.merchant_id) {
      return fail("token_failed");
    }

    await persistSquareConnection({
      organizationId: state.organizationId,
      userId: user.id,
      merchantId: tokens.merchant_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at ? new Date(tokens.expires_at) : null,
    });

    return NextResponse.redirect(
      `${origin}/${locale}/settings/payments?square=connected`,
    );
  } catch (error) {
    console.error("square oauth callback:", error);
    return fail("save_failed");
  }
}
