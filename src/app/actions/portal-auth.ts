"use server";

import { createHmac } from "node:crypto";
import { redirect } from "@/i18n/navigation";
import { getRequestClientIp } from "@/lib/booking/abuse";
import { getAppBaseUrl } from "@/lib/app-url";
import { sendPortalInviteEmail } from "@/lib/email/portal-invite";
import { formAcceptedLegal } from "@/lib/legal/acceptance";
import {
  checkPortalForgotRateLimit,
  checkPortalVerifyRateLimit,
  clearPortalSessionCookie,
  establishPortalSession,
  lookupPortalAccess,
  portalPasswordExists,
  recordPortalForgotPassword,
  recordPortalVerifyFailure,
  resetPortalPassword,
  setPortalPassword,
  verifyPortalLogin,
} from "@/lib/portal/auth";
import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { recordAuditEvent } from "@/lib/security/audit";
import { parseShareLinkPassword } from "@/lib/security/share-password";
import { decryptPersonRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { toAppLocale } from "@/lib/i18n/locales";

import type { PortalAuthActionState } from "./portal-state";

function accessIdFromForm(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const code = String(formData.get("accessCode") || "").trim();
  return token || code;
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

export async function setPortalPasswordAction(
  _prev: PortalAuthActionState,
  formData: FormData,
): Promise<PortalAuthActionState> {
  try {
    const accessId = accessIdFromForm(formData);
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (!accessId) return { error: "invalid" };
    if (!formAcceptedLegal(formData)) return { error: "legal_required" };
    if (password !== confirm) return { error: "mismatch" };

    const parsed = parseShareLinkPassword(password);
    if (!parsed.success) return { error: "weak_password" };

    const access = await lookupPortalAccess(accessId);
    if (!access) return { error: "invalid" };

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
    const accessId = accessIdFromForm(formData);
    const password = String(formData.get("password") || "");
    if (!accessId || !password) return { error: "invalid" };

    const access = await lookupPortalAccess(accessId);
    if (!access) return { error: "invalid" };

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
  const accessId = accessIdFromForm(formData);
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  if (!accessId) return { error: "invalid" };

  const access = await lookupPortalAccess(accessId);
  if (!access) return { error: "invalid" };

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
  const portalUrl = `${base.replace(/\/$/, "")}/${locale}/portal/${reset.access_token}`;
  const clientName =
    `${person.first_name} ${person.last_name}`.trim() || email;

  const emailResult = await sendPortalInviteEmail({
    locale: person.preferred_locale || locale,
    to: email,
    clientName,
    organizationName: String(org?.name ?? ""),
    portalUrl,
    accessCode: reset.access_code,
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
    redirect({ href: "/portal", locale });
    return {};
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("logoutPortalAction:", err);
    return { error: "server_config" };
  }
}
