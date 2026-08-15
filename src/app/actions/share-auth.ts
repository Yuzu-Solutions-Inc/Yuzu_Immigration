"use server";

import { createHmac } from "node:crypto";
import { redirect } from "next/navigation";

import { getRequestClientIp } from "@/lib/booking/abuse";
import { sendShareLinkResetEmail } from "@/lib/email/share-link-reset";
import { loadShareFillGate } from "@/lib/ircc/share-fill-gate";
import { listActiveProjectPeople } from "@/lib/ircc/project-forms";
import {
  assertShareAuthenticated,
  checkShareForgotRateLimit,
  checkShareVerifyRateLimit,
  recordShareForgotPassword,
  recordShareVerifyFailure,
  setShareLinkPassword,
  setShareSessionCookie,
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

export type ShareAuthActionState = {
  error?: string;
  message?: string;
};

const initialState: ShareAuthActionState = {};

function hashIp(ip: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`share-ip:${ip}`)
    .digest("hex");
}

async function getIpHash() {
  const ip = await getRequestClientIp();
  return ip ? hashIp(ip) : null;
}

function redirectShareAuthError(locale: string, token: string, error: string) {
  redirect(
    `/${locale}/fill/${token}?shareError=${encodeURIComponent(error)}`,
  );
}

export async function setSharePasswordFormAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const locale = String(formData.get("locale") || "en");

  if (!token) redirectShareAuthError(locale, "invalid", "invalid");
  if (password !== confirm) redirectShareAuthError(locale, token, "mismatch");

  const parsed = parseShareLinkPassword(password);
  if (!parsed.success) redirectShareAuthError(locale, token, "weak_password");

  const gate = await loadShareFillGate(token);
  if (!gate) redirectShareAuthError(locale, token, "expired");
  if (gate.access !== "needs_password_setup") {
    redirectShareAuthError(locale, token, "invalid");
  }

  const resolved = toResolvedShareLink(
    {
      organizationId: gate.organizationId,
      projectId: gate.projectId,
      linkId: gate.linkId,
      expiresAt: gate.expiresAt,
    },
    token,
  );

  const result = await setShareLinkPassword(resolved.tokenHash, password);
  if (result === "invalid_password") {
    redirectShareAuthError(locale, token, "weak_password");
  }
  if (result === "already_set") {
    redirectShareAuthError(locale, token, "already_set");
  }
  if (result !== "ok") redirectShareAuthError(locale, token, "expired");

  try {
    await setShareSessionCookie(resolved);
  } catch (err) {
    console.error("setShareSessionCookie:", err);
    redirectShareAuthError(locale, token, "server_config");
  }

  await recordAuditEvent({
    organizationId: gate.organizationId,
    actorKind: "share_link",
    action: "share_link.password_set",
    resourceType: "immigration_project",
    resourceId: gate.projectId,
    metadata: { shareLinkId: gate.linkId },
  });

  redirect(`/${locale}/fill/${token}`);
}

export async function loginSharePasswordFormAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const locale = String(formData.get("locale") || "en");

  if (!token || !password) redirectShareAuthError(locale, token || "invalid", "invalid");

  const gate = await loadShareFillGate(token);
  if (!gate) redirectShareAuthError(locale, token, "expired");
  if (gate.access !== "needs_password_login") {
    redirectShareAuthError(locale, token, "invalid");
  }

  const resolved = toResolvedShareLink(
    {
      organizationId: gate.organizationId,
      projectId: gate.projectId,
      linkId: gate.linkId,
      expiresAt: gate.expiresAt,
    },
    token,
  );

  if (await checkShareVerifyRateLimit(resolved) === "rate_limited") {
    redirectShareAuthError(locale, token, "rate_limited");
  }

  const ok = await verifyShareLinkPassword(resolved.tokenHash, password);
  if (!ok) {
    await recordShareVerifyFailure(resolved);
    redirectShareAuthError(locale, token, "wrong_password");
  }

  try {
    await setShareSessionCookie(resolved);
  } catch (err) {
    console.error("setShareSessionCookie:", err);
    redirectShareAuthError(locale, token, "server_config");
  }

  await recordAuditEvent({
    organizationId: gate.organizationId,
    actorKind: "share_link",
    action: "share_link.password_login",
    resourceType: "immigration_project",
    resourceId: gate.projectId,
    metadata: { shareLinkId: gate.linkId },
  });

  redirect(`/${locale}/fill/${token}`);
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
  await recordAuditEvent({
    organizationId: gate.organizationId,
    actorKind: "share_link",
    action: "share_link.password_forgot",
    resourceType: "immigration_project",
    resourceId: gate.projectId,
    metadata: {
      oldShareLinkId: gate.linkId,
      newShareLinkId: created.linkId,
    },
  });

  const { clearShareSessionCookie } = await import("@/lib/ircc/share-auth");
  await clearShareSessionCookie();

  return { message: "email_sent" };
}

export async function assertShareTokenForAction(token: string) {
  return assertShareAuthenticated(token);
}

export { initialState as shareAuthInitialState };
