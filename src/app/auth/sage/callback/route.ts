import { NextResponse } from "next/server";

import { persistSageConnection } from "@/app/actions/sage";
import {
  decodeSageOAuthState,
  exchangeSageCode,
} from "@/lib/sage/oauth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const state = stateRaw ? decodeSageOAuthState(stateRaw) : null;
  const locale = state?.locale ?? "en";
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/${locale}/settings/payments?sage=${encodeURIComponent(reason)}`,
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
  if (!membership || membership.role !== "admin") {
    return fail("forbidden");
  }

  try {
    const redirectOrigin = state.origin || origin;
    const tokens = await exchangeSageCode({
      origin: redirectOrigin,
      code,
    });
    if (!tokens.access_token || !tokens.refresh_token) {
      return fail("token_failed");
    }

    await persistSageConnection({
      organizationId: state.organizationId,
      userId: user.id,
      tokens,
    });

    return NextResponse.redirect(
      `${origin}/${locale}/settings/payments?sage=connected`,
    );
  } catch (error) {
    console.error("sage oauth callback:", error);
    return fail("save_failed");
  }
}
