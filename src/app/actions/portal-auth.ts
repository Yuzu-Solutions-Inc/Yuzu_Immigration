"use server";

import { createHmac } from "node:crypto";
import { redirect as nextRedirect } from "next/navigation";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { getRequestClientIp } from "@/lib/booking/abuse";
import { getAppBaseUrl } from "@/lib/app-url";
import { sendPortalInviteEmail } from "@/lib/email/portal-invite";
import { formAcceptedLegal } from "@/lib/legal/acceptance";
import {
  checkPortalForgotRateLimit,
  checkPortalGoogleOAuthRateLimit,
  checkPortalIdentifyRateLimit,
  checkPortalVerifyRateLimit,
  clearPortalSessionCookie,
  establishPortalSession,
  findPortalMatches,
  lookupPortalAccess,
  portalBaseUrl,
  portalPasswordExists,
  recordPortalForgotPassword,
  recordPortalGoogleOAuthAttempt,
  recordPortalIdentifyAttempt,
  recordPortalVerifyFailure,
  resetPortalPassword,
  resolvePortalAccount,
  setPortalPassword,
  verifyPortalLogin,
  type PortalAccessRow,
  type PortalEmailMatch,
} from "@/lib/portal/auth";
import {
  clearPortalGooglePending,
  consumePortalLegalPreAccept,
  findPortalGoogleMatches,
  markPortalGoogleLogin,
  markPortalLegalAccepted,
  portalNeedsLegalConsent,
  readPortalGooglePending,
  resolvePortalGoogleAccess,
  setPortalGoogleOAuthNonce,
} from "@/lib/portal/google";
import {
  encodePortalGoogleOAuthState,
  portalGoogleAuthUrl,
  portalGoogleConfigured,
} from "@/lib/google/portal-oauth";
import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { recordAuditEvent } from "@/lib/security/audit";
import { parseShareLinkPassword } from "@/lib/security/share-password";
import { decryptPersonRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { toAppLocale } from "@/lib/i18n/locales";

import type { PortalAuthActionState } from "./portal-state";

const emailSchema = z.string().trim().email().max(320);
const uuid = z.string().uuid();

function accessIdFromForm(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const code = String(formData.get("accessCode") || "").trim();
  return token || code;
}

function identityFromForm(formData: FormData) {
  const email = emailSchema.safeParse(String(formData.get("email") || ""));
  const personId = uuid.safeParse(String(formData.get("personId") || ""));
  const organizationId = uuid.safeParse(
    String(formData.get("organizationId") || ""),
  );
  if (!email.success || !personId.success || !organizationId.success) {
    return null;
  }
  return {
    email: email.data,
    personId: personId.data,
    organizationId: organizationId.data,
  };
}

function hashIp(ip: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`portal-ip:${ip}`)
    .digest("hex");
}

async function getIpHash() {
  const ip = await getRequestClientIp();
  return ip ? hashIp(ip) : null;
}

function choiceLabel(match: PortalEmailMatch) {
  if (match.personLabel && match.organizationName) {
    return `${match.personLabel} · ${match.organizationName}`;
  }
  return match.organizationName || match.personLabel;
}

function identifiedState(
  access: PortalAccessRow,
  match: PortalEmailMatch,
  hasPassword: boolean,
): PortalAuthActionState {
  return {
    message: hasPassword ? "needs_login" : "needs_setup",
    personId: access.person_id,
    organizationId: access.organization_id,
    organizationName: match.organizationName,
    googleLoginEnabled: match.googleLoginEnabled,
    legalAccepted: Boolean(access.legal_accepted_at),
  };
}

async function resolveIdentifiedAccess(
  formData: FormData,
): Promise<
  | { access: PortalAccessRow }
  | { error: PortalAuthActionState }
> {
  const token = accessIdFromForm(formData);
  if (token) {
    const access = await lookupPortalAccess(token);
    if (!access || !access.is_active) return { error: { error: "invalid" } };
    return { access };
  }

  const identity = identityFromForm(formData);
  if (!identity) return { error: { error: "invalid" } };
  const resolved = await resolvePortalAccount(
    identity.email,
    identity.personId,
    identity.organizationId,
  );
  if (!resolved || resolved === "disabled") {
    return { error: { error: "invalid" } };
  }
  return { access: resolved };
}

export async function identifyPortalAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  try {
    const parsedEmail = emailSchema.safeParse(String(formData.get("email") || ""));
    if (!parsedEmail.success) return { error: "invalid" };
    const email = parsedEmail.data;

    const ipHash = await getIpHash();
    if ((await checkPortalIdentifyRateLimit(email, ipHash)) === "rate_limited") {
      return { error: "rate_limited" };
    }
    await recordPortalIdentifyAttempt(email);

    const matches = await findPortalMatches(email);
    if (matches.length === 0) return { error: "invalid" };

    const accountKey = String(formData.get("account") || "").trim();
    const [keyPerson, keyOrg] = accountKey.split(":");
    const selectedPerson = uuid.safeParse(
      String(formData.get("personId") || keyPerson || ""),
    );
    const selectedOrg = uuid.safeParse(
      String(formData.get("organizationId") || keyOrg || ""),
    );
    const selected =
      selectedPerson.success && selectedOrg.success
        ? matches.find(
            (row) =>
              row.personId === selectedPerson.data &&
              row.organizationId === selectedOrg.data,
          )
        : matches.length === 1
          ? matches[0]
          : null;

    if (!selected) {
      return {
        message: "choose_org",
        organizations: matches.map((row) => ({
          personId: row.personId,
          organizationId: row.organizationId,
          label: choiceLabel(row),
        })),
      };
    }

    const access = await resolvePortalAccount(
      email,
      selected.personId,
      selected.organizationId,
    );
    if (!access || access === "disabled") return { error: "invalid" };

    const hasPassword = await portalPasswordExists(
      access.access_token || access.access_code,
    );
    return identifiedState(access, selected, hasPassword);
  } catch (err) {
    console.error("identifyPortalAction:", err);
    return { error: "server_config" };
  }
}

export async function setPortalPasswordAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  try {
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (!formAcceptedLegal(formData)) return { error: "legal_required" };
    if (password !== confirm) return { error: "mismatch" };

    const parsed = parseShareLinkPassword(password);
    if (!parsed.success) return { error: "weak_password" };

    const resolved = await resolveIdentifiedAccess(formData);
    if ("error" in resolved) return resolved.error;
    const { access } = resolved;

    if (await portalPasswordExists(access.access_token)) {
      return { error: "already_set" };
    }

    const result = await setPortalPassword(access.access_token, password);
    if (result === "invalid_password") return { error: "weak_password" };
    if (result === "already_set") return { error: "already_set" };
    if (result !== "ok") return { error: "invalid" };

    try {
      await establishPortalSession(access);
    } catch (err) {
      console.error("setPortalSessionCookie:", err);
      return { error: "server_config" };
    }

    await markPortalLegalAccepted(access);

    void recordAuditEvent({
      organizationId: access.organization_id,
      actorKind: "portal",
      action: "portal.password_set",
      resourceType: "person",
      resourceId: access.person_id,
    }).catch((err) => console.error("portal auth audit:", err));

    return { message: "authenticated" };
  } catch (err) {
    console.error("setPortalPasswordAction:", err);
    return { error: "server_config" };
  }
}

export async function loginPortalAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  try {
    const password = String(formData.get("password") || "");
    if (!password) return { error: "invalid" };

    const resolved = await resolveIdentifiedAccess(formData);
    if ("error" in resolved) return resolved.error;
    const { access } = resolved;

    if (!(await portalPasswordExists(access.access_token))) {
      return { error: "needs_setup" };
    }

    if ((await checkPortalVerifyRateLimit(access)) === "rate_limited") {
      return { error: "rate_limited" };
    }

    const verified = await verifyPortalLogin(access.access_token, password);
    if (!verified) {
      await recordPortalVerifyFailure(access);
      return { error: "wrong_password" };
    }

    try {
      await establishPortalSession(verified);
    } catch (err) {
      console.error("setPortalSessionCookie:", err);
      return { error: "server_config" };
    }

    void recordAuditEvent({
      organizationId: verified.organization_id,
      actorKind: "portal",
      action: "portal.password_login",
      resourceType: "person",
      resourceId: verified.person_id,
    }).catch((err) => console.error("portal auth audit:", err));

    return { message: "authenticated" };
  } catch (err) {
    console.error("loginPortalAction:", err);
    return { error: "server_config" };
  }
}

export async function forgotPortalPasswordAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  const resolved = await resolveIdentifiedAccess(formData);
  if ("error" in resolved) return resolved.error;
  const { access } = resolved;

  const ipHash = await getIpHash();
  if ((await checkPortalForgotRateLimit(access, ipHash)) === "rate_limited") {
    return { error: "rate_limited" };
  }

  const admin = createServiceClient();
  const { data: personRow } = await admin
    .from("people")
    .select("first_name, last_name, email, preferred_locale")
    .eq("id", access.person_id)
    .maybeSingle();
  if (!personRow) return { error: "invalid" };

  const person = decryptPersonRow(
    personRow,
    await getOrgDataKey(access.organization_id),
  );
  const email = person.email?.trim();
  if (!email) return { error: "no_email" };

  const reset = await resetPortalPassword(access.access_token);
  if (!reset) return { error: "send_failed" };

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", access.organization_id)
    .maybeSingle();

  const base = await getAppBaseUrl();
  const url = portalBaseUrl(base, locale);
  const clientName =
    `${person.first_name} ${person.last_name}`.trim() || email;

  const emailResult = await sendPortalInviteEmail({
    locale: person.preferred_locale || locale,
    to: email,
    clientName,
    organizationName: String(org?.name ?? ""),
    portalUrl: url,
    reset: true,
  });

  if (!emailResult.sent) {
    console.error("forgotPortalPassword email:", emailResult.reason);
    return { error: "email_not_configured" };
  }

  await recordPortalForgotPassword(access);
  await clearPortalSessionCookie();
  void recordAuditEvent({
    organizationId: access.organization_id,
    actorKind: "portal",
    action: "portal.password_forgot",
    resourceType: "person",
    resourceId: access.person_id,
  }).catch((err) => console.error("portal auth audit:", err));

  return { message: "email_sent" };
}

export async function logoutPortalAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  try {
    const locale = toAppLocale(String(formData.get("locale") || "en"));
    await clearPortalSessionCookie();
    await clearPortalGooglePending();
    redirect({ href: "/portal", locale });
    return {};
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("logoutPortalAction:", err);
    return { error: "server_config" };
  }
}

export async function startPortalGoogleAction(formData: FormData) {
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  const fail = (reason: string): never => {
    nextRedirect(`/${locale}/portal?error=${encodeURIComponent(reason)}`);
  };

  if (!portalGoogleConfigured()) fail("google");

  const ipHash = await getIpHash();
  if ((await checkPortalGoogleOAuthRateLimit(ipHash)) === "rate_limited") {
    fail("rate_limited");
  }
  await recordPortalGoogleOAuthAttempt();

  const token = accessIdFromForm(formData) || undefined;
  const emailRaw = String(formData.get("email") || "").trim();
  const email = emailSchema.safeParse(emailRaw);
  const personId = uuid.safeParse(String(formData.get("personId") || ""));
  const organizationId = uuid.safeParse(
    String(formData.get("organizationId") || ""),
  );

  const origin = await getAppBaseUrl();
  const { state, nonce } = encodePortalGoogleOAuthState({
    locale,
    origin,
    email: email.success ? email.data : undefined,
    personId: personId.success ? personId.data : undefined,
    organizationId: organizationId.success ? organizationId.data : undefined,
    token,
  });
  await setPortalGoogleOAuthNonce(nonce);
  nextRedirect(portalGoogleAuthUrl({ origin, state }));
}

export async function completePortalGoogleAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  try {
    const pending = await readPortalGooglePending();
    if (!pending) return { error: "google" };

    const matches = await findPortalGoogleMatches(pending);
    if (matches.length === 0) {
      await clearPortalGooglePending();
      return { error: "google" };
    }

    const accountKey = String(formData.get("account") || "").trim();
    const [keyPerson, keyOrg] = accountKey.split(":");
    const selectedPerson = uuid.safeParse(
      String(formData.get("personId") || keyPerson || pending.personId || ""),
    );
    const selectedOrg = uuid.safeParse(
      String(
        formData.get("organizationId") || keyOrg || pending.organizationId || "",
      ),
    );
    const selected =
      selectedPerson.success && selectedOrg.success
        ? matches.find(
            (row) =>
              row.personId === selectedPerson.data &&
              row.organizationId === selectedOrg.data,
          )
        : matches.length === 1
          ? matches[0]
          : null;

    if (!selected) {
      return {
        message: "google_choose_org",
        organizations: matches.map((row) => ({
          personId: row.personId,
          organizationId: row.organizationId,
          label: choiceLabel(row),
        })),
        googleLoginEnabled: true,
      };
    }

    const access = await resolvePortalGoogleAccess(
      pending,
      {
        personId: selected.personId,
        organizationId: selected.organizationId,
      },
      pending.token,
    );
    if (!access || access === "disabled") {
      await clearPortalGooglePending();
      return { error: "google" };
    }

    const needsLegal = await portalNeedsLegalConsent(access);
    const acceptedOnForm = formAcceptedLegal(formData);
    const acceptedBeforeOAuth = needsLegal
      ? await consumePortalLegalPreAccept()
      : false;
    if (needsLegal && !acceptedOnForm && !acceptedBeforeOAuth) {
      return {
        message: "google_legal",
        personId: selected.personId,
        organizationId: selected.organizationId,
        organizationName: selected.organizationName,
        googleLoginEnabled: true,
      };
    }

    await markPortalGoogleLogin(
      access,
      pending.googleSub,
      acceptedOnForm || acceptedBeforeOAuth,
    );
    await clearPortalGooglePending();
    try {
      await establishPortalSession(access);
    } catch (err) {
      console.error("setPortalSessionCookie:", err);
      return { error: "server_config" };
    }

    void recordAuditEvent({
      organizationId: access.organization_id,
      actorKind: "portal",
      action: "portal.google_login",
      resourceType: "person",
      resourceId: access.person_id,
    }).catch((err) => console.error("portal google audit:", err));

    return { message: "authenticated" };
  } catch (err) {
    console.error("completePortalGoogleAction:", err);
    return { error: "server_config" };
  }
}

export async function cancelPortalGoogleAction(): Promise<PortalAuthActionState> {
  await clearPortalGooglePending();
  return {};
}
