import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";

import { getRequestClientIp } from "@/lib/booking/abuse";
import {
  decodePortalGoogleOAuthState,
  exchangePortalGoogleCode,
  portalGoogleIdentity,
} from "@/lib/google/portal-oauth";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  checkPortalGoogleOAuthRateLimit,
  establishPortalSession,
  recordPortalGoogleOAuthAttempt,
} from "@/lib/portal/auth";
import {
  clearPortalGoogleOAuthNonce,
  consumePortalLegalPreAccept,
  findPortalGoogleMatches,
  googleEmailMatchesExpected,
  markPortalGoogleLogin,
  portalNeedsLegalConsent,
  readPortalGoogleOAuthNonce,
  resolvePortalGoogleAccess,
  setPortalGooglePending,
} from "@/lib/portal/google";
import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { recordAuditEvent } from "@/lib/security/audit";

function hashIp(ip: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`portal-ip:${ip}`)
    .digest("hex");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const state = stateRaw ? decodePortalGoogleOAuthState(stateRaw) : null;
  const locale = toAppLocale(state?.locale);
  const redirectOrigin = state?.origin || origin;

  const fail = async (reason: string) => {
    await clearPortalGoogleOAuthNonce();
    return NextResponse.redirect(
      `${redirectOrigin}/${locale}/portal?error=${encodeURIComponent(reason)}`,
    );
  };

  if (errorParam || !code || !state) {
    return fail("google");
  }

  const nonce = await readPortalGoogleOAuthNonce();
  if (!nonce || nonce !== state.nonce) {
    return fail("google");
  }
  await clearPortalGoogleOAuthNonce();

  const ip = await getRequestClientIp();
  const ipHash = ip ? hashIp(ip) : null;
  if ((await checkPortalGoogleOAuthRateLimit(ipHash)) === "rate_limited") {
    return fail("rate_limited");
  }
  await recordPortalGoogleOAuthAttempt();

  try {
    const tokens = await exchangePortalGoogleCode({
      origin: redirectOrigin,
      code,
    });
    const identity = await portalGoogleIdentity(tokens.access_token);
    if (!identity) return fail("google");
    if (!googleEmailMatchesExpected(identity.email, state.email)) {
      return fail("google");
    }

    const matches = await findPortalGoogleMatches(identity);
    const selected =
      state.personId && state.organizationId
        ? matches.find(
            (row) =>
              row.personId === state.personId &&
              row.organizationId === state.organizationId,
          )
        : matches.length === 1
          ? matches[0]
          : null;

    if (matches.length === 0) return fail("google");

    if (!selected) {
      await setPortalGooglePending({
        ...identity,
        locale,
        exp: Date.now() + 10 * 60 * 1000,
        token: state.token,
      });
      return NextResponse.redirect(
        `${redirectOrigin}/${locale}/portal?google=choose`,
      );
    }

    const access = await resolvePortalGoogleAccess(
      identity,
      {
        personId: selected.personId,
        organizationId: selected.organizationId,
      },
      state.token,
    );
    if (!access || access === "disabled") return fail("google");

    if (await portalNeedsLegalConsent(access)) {
      if (!(await consumePortalLegalPreAccept())) {
        await setPortalGooglePending({
          ...identity,
          locale,
          exp: Date.now() + 10 * 60 * 1000,
          personId: selected.personId,
          organizationId: selected.organizationId,
          token: state.token,
        });
        return NextResponse.redirect(
          `${redirectOrigin}/${locale}/portal?google=legal`,
        );
      }
      await markPortalGoogleLogin(access, identity.googleSub, true);
    } else {
      await markPortalGoogleLogin(access, identity.googleSub, false);
    }
    await establishPortalSession(access);
    void recordAuditEvent({
      organizationId: access.organization_id,
      actorKind: "portal",
      action: "portal.google_login",
      resourceType: "person",
      resourceId: access.person_id,
    }).catch((err) => console.error("portal google audit:", err));

    return NextResponse.redirect(`${redirectOrigin}/${locale}/portal/home`);
  } catch (error) {
    console.error("portal google callback:", error);
    return fail("google");
  }
}
