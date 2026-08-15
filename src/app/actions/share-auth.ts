"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRequestClientIp } from "@/lib/booking/abuse";
import { sendShareLinkResetEmail } from "@/lib/email/share-link-reset";
import {
  listActiveProjectPeople,
  loadShareGateContext,
} from "@/lib/ircc/project-forms";
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

export async function setSharePasswordAction(
  _prev: ShareAuthActionState,
  formData: FormData,
): Promise<ShareAuthActionState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const locale = String(formData.get("locale") || "en");

  if (!token) return { error: "invalid" };
  if (password !== confirm) return { error: "mismatch" };

  const parsed = parseShareLinkPassword(password);
  if (!parsed.success) return { error: "weak_password" };

  const gate = await loadShareGateContext(token);
  if (!gate) return { error: "expired" };
  if (gate.access !== "needs_password_setup") return { error: "invalid" };

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
  if (result === "invalid_password") return { error: "weak_password" };
  if (result === "already_set") return { error: "already_set" };
  if (result !== "ok") return { error: "expired" };

  await setShareSessionCookie(resolved);
  await recordAuditEvent({
    organizationId: gate.organizationId,
    actorKind: "share_link",
    action: "share_link.password_set",
    resourceType: "immigration_project",
    resourceId: gate.projectId,
    metadata: { shareLinkId: gate.linkId },
  });

  revalidatePath(`/${locale}/fill/${token}`);
  redirect(`/${locale}/fill/${token}`);
}

export async function loginSharePasswordAction(
  _prev: ShareAuthActionState,
  formData: FormData,
): Promise<ShareAuthActionState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const locale = String(formData.get("locale") || "en");

  if (!token || !password) return { error: "invalid" };

  const gate = await loadShareGateContext(token);
  if (!gate) return { error: "expired" };
  if (gate.access !== "needs_password_login") return { error: "invalid" };

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
    return { error: "rate_limited" };
  }

  const ok = await verifyShareLinkPassword(resolved.tokenHash, password);
  if (!ok) {
    await recordShareVerifyFailure(resolved);
    return { error: "wrong_password" };
  }

  await setShareSessionCookie(resolved);
  await recordAuditEvent({
    organizationId: gate.organizationId,
    actorKind: "share_link",
    action: "share_link.password_login",
    resourceType: "immigration_project",
    resourceId: gate.projectId,
    metadata: { shareLinkId: gate.linkId },
  });

  revalidatePath(`/${locale}/fill/${token}`);
  redirect(`/${locale}/fill/${token}`);
}

export async function forgotSharePasswordAction(
  _prev: ShareAuthActionState,
  formData: FormData,
): Promise<ShareAuthActionState> {
  const token = String(formData.get("token") || "");
  const locale = String(formData.get("locale") || "en");

  if (!token) return { error: "invalid" };

  const gate = await loadShareGateContext(token);
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
