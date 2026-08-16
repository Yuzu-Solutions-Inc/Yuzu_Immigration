"use server";

import { createHmac } from "node:crypto";

import { getRequestClientIp } from "@/lib/booking/abuse";
import { sendShareLinkResetEmail } from "@/lib/email/share-link-reset";
import { loadShareFillGate } from "@/lib/ircc/share-fill-gate";
import {
  listActiveProjectPeople,
  resolveShareToken,
} from "@/lib/ircc/project-forms";
import {
  assertShareAuthenticated,
  checkShareForgotRateLimit,
  checkShareVerifyRateLimit,
  recordShareForgotPassword,
  recordShareVerifyFailure,
  setShareLinkPassword,
  setShareSessionCookie,
  shareLinkPasswordExists,
  toResolvedShareLink,
  verifyShareLinkPassword,
} from "@/lib/ircc/share-auth";
import {
  createShareLinkForProject,
  revokeAllShareLinksForProject,
} from "@/lib/ircc/share-links";
import { recordAuditEvent } from "@/lib/security/audit";
import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { parseShareLinkPassword } from "@/lib/security/share-password";
import { createServiceClient } from "@/lib/supabase/admin";

import type { ShareAuthActionState } from "./share-auth-state";

function hashIp(ip: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`share-ip:${ip}`)
    .digest("hex");
}

async function getIpHash() {
  const ip = await getRequestClientIp();
  return ip ? hashIp(ip) : null;
}

function auditShareAuthEvent(input: {
  organizationId: string;
  projectId: string;
  action: string;
  shareLinkId: string;
}) {
  void recordAuditEvent({
    organizationId: input.organizationId,
    actorKind: "share_link",
    action: input.action,
    resourceType: "immigration_project",
    resourceId: input.projectId,
    metadata: { shareLinkId: input.shareLinkId },
  }).catch((err) => console.error("share auth audit:", err));
}

export async function setSharePasswordAction(
  _prev: ShareAuthActionState,
  formData: FormData,
): Promise<ShareAuthActionState> {
  try {
    const token = String(formData.get("token") || "");
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (!token) return { error: "invalid" };
    if (password !== confirm) return { error: "mismatch" };

    const parsed = parseShareLinkPassword(password);
    if (!parsed.success) return { error: "weak_password" };

    const resolved = await resolveShareToken(token);
    if (!resolved) return { error: "expired" };

    const full = toResolvedShareLink(resolved, token);
    if (await shareLinkPasswordExists(full.tokenHash)) {
      return { error: "already_set" };
    }

    const result = await setShareLinkPassword(full.tokenHash, password);
    if (result === "invalid_password") return { error: "weak_password" };
    if (result === "already_set") return { error: "already_set" };
    if (result !== "ok") return { error: "expired" };

    try {
      await setShareSessionCookie(full);
    } catch (err) {
      console.error("setShareSessionCookie:", err);
      return { error: "server_config" };
    }

    auditShareAuthEvent({
      organizationId: resolved.organizationId,
      projectId: resolved.projectId,
      action: "share_link.password_set",
      shareLinkId: resolved.linkId,
    });

    return { message: "authenticated" };
  } catch (err) {
    console.error("setSharePasswordAction:", err);
    return { error: "server_config" };
  }
}

export async function loginSharePasswordAction(
  _prev: ShareAuthActionState,
  formData: FormData,
): Promise<ShareAuthActionState> {
  try {
    const token = String(formData.get("token") || "");
    const password = String(formData.get("password") || "");

    if (!token || !password) return { error: "invalid" };

    const resolved = await resolveShareToken(token);
    if (!resolved) return { error: "expired" };

    const full = toResolvedShareLink(resolved, token);
    if (!(await shareLinkPasswordExists(full.tokenHash))) {
      return { error: "invalid" };
    }

    if (await checkShareVerifyRateLimit(full) === "rate_limited") {
      return { error: "rate_limited" };
    }

    const ok = await verifyShareLinkPassword(full.tokenHash, password);
    if (!ok) {
      await recordShareVerifyFailure(full);
      return { error: "wrong_password" };
    }

    try {
      await setShareSessionCookie(full);
    } catch (err) {
      console.error("setShareSessionCookie:", err);
      return { error: "server_config" };
    }

    auditShareAuthEvent({
      organizationId: resolved.organizationId,
      projectId: resolved.projectId,
      action: "share_link.password_login",
      shareLinkId: resolved.linkId,
    });

    return { message: "authenticated" };
  } catch (err) {
    console.error("loginSharePasswordAction:", err);
    return { error: "server_config" };
  }
}

export async function forgotSharePasswordAction(
  _prev: ShareAuthActionState,
  formData: FormData,
): Promise<ShareAuthActionState> {
  const token = String(formData.get("token") || "");
  const locale = String(formData.get("locale") || "en");

  if (!token) return { error: "invalid" };

  const gate = await loadShareFillGate(token);
  if (!gate) return { error: "expired" };

  const resolved = toResolvedShareLink(
    {
      organizationId: gate.organizationId,
      projectId: gate.projectId,
      linkId: gate.linkId,
      expiresAt: gate.expiresAt,
    },
    token,
  );

  const ipHash = await getIpHash();
  if (await checkShareForgotRateLimit(resolved, ipHash) === "rate_limited") {
    return { error: "rate_limited" };
  }

  const admin = createServiceClient();
  const people = await listActiveProjectPeople(admin, gate.projectId);
  const principal =
    people.find((p) => p.role === "principal") ?? people[0];
  const email = principal?.email?.trim();
  if (!email) return { error: "no_email" };

  const revoked = await revokeAllShareLinksForProject(
    admin,
    gate.projectId,
    gate.organizationId,
  );
  if (!revoked) return { error: "send_failed" };

  const created = await createShareLinkForProject(admin, {
    organizationId: gate.organizationId,
    projectId: gate.projectId,
    locale,
  });
  if (!created) return { error: "send_failed" };

  const clientName =
    `${principal.firstName} ${principal.lastName}`.trim() || email;

  const emailResult = await sendShareLinkResetEmail({
    locale,
    to: email,
    clientName,
    organizationName: gate.organizationName,
    projectTitle: gate.projectTitle,
    shareUrl: created.shareUrl,
    expiresAt: created.expiresAt,
  });

  if (!emailResult.sent) {
    console.error("forgotSharePassword email:", emailResult.reason);
    return { error: "email_not_configured" };
  }

  await recordShareForgotPassword(resolved);
  auditShareAuthEvent({
    organizationId: gate.organizationId,
    projectId: gate.projectId,
    action: "share_link.password_forgot",
    shareLinkId: gate.linkId,
  });

  const { clearShareSessionCookie } = await import("@/lib/ircc/share-auth");
  await clearShareSessionCookie();

  return { message: "email_sent" };
}

export async function assertShareTokenForAction(token: string) {
  return assertShareAuthenticated(token);
}
