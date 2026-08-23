import "server-only";

import { createTranslator } from "next-intl";
import { Resend } from "resend";

import { email as emailTokens } from "@/lib/design-tokens";
import { resolveFirmContact } from "@/lib/email/firm-contact";
import {
  emailIdempotencyKey,
  isEmailSuppressed,
  recordOutboundEmail,
} from "@/lib/email/outbound";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { dictionaries } from "@/lib/i18n/dictionaries";

const messagesByLocale = dictionaries;

export { emailIdempotencyKey };

function emailConfigured() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BOOKING_FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

let resendClient: Resend | null = null;

function getResend(apiKey: string) {
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

function parseFromEnv(raw: string) {
  const angle = raw.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? raw).trim();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return {
    email,
    local: email.slice(0, at),
    domain: email.slice(at + 1),
  };
}

function orgLocalPart(organizationName: string) {
  const compact = organizationName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
  if (!compact) return "Firm";
  return compact.slice(0, 48);
}

function safeDisplayName(value: string) {
  const cleaned = value.replace(/[<>"]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || "Bookings";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function footerNotice(html: string, text: string, notice: string) {
  const footerHtml = `<div style="max-width:560px;margin:16px auto 0;padding:0 8px;font-size:12px;line-height:1.5;color:${emailTokens.textMuted};">${escapeHtml(notice)}</div>`;
  const htmlOut = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${footerHtml}</body>`)
    : `${html}${footerHtml}`;
  const textOut = `${text.trim()}\n\n—\n${notice}`;
  return { html: htmlOut, text: textOut };
}

function notificationFooterCopy(input: {
  locale: AppLocale;
  contact: { email: string; name: string } | null;
  allowReply: boolean;
}) {
  const t = createTranslator({
    locale: input.locale,
    messages: messagesByLocale[input.locale],
    namespace: "bookingEmail",
  });
  if (input.allowReply) return null;
  if (input.contact) {
    return t("doNotReplyContact", {
      name: input.contact.name,
      email: input.contact.email,
    });
  }
  return t("doNotReply");
}

/** Per-org From on the verified platform domain. Replies are not accepted. */
export function bookingSenderForOrg(organizationName: string) {
  const configured = emailConfigured();
  if (!configured) return null;
  const parsed = parseFromEnv(configured.from);
  if (!parsed) {
    return { from: configured.from };
  }
  const display = safeDisplayName(`${organizationName} Bookings`);
  const address = `${orgLocalPart(organizationName)}+Bookings@${parsed.domain}`;
  return {
    from: `${display} <${address}>`,
  };
}

export type SendResendEmailResult =
  | { sent: true; id: string }
  | {
      sent: false;
      reason: "not_configured" | "send_failed" | "suppressed";
    };

/**
 * Outbound notifications only. Replies are blocked by default (no Reply-To,
 * Auto-Submitted). Every client-facing notice should resolve a firm contact
 * (consultant or org privacy email) for the footer.
 */
export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind?: string;
  idempotencyKey?: string;
  organizationName?: string;
  organizationId?: string | null;
  locale?: string;
  /** @deprecated Replies are always blocked for client notifications. */
  includeDoNotReply?: boolean;
  /**
   * Rare: allow Reply-To (e.g. privacy deletion notice to the firm, Reply-To client).
   * Client-facing notifications must omit this.
   */
  replyTo?: string;
  /** Unused — kept so callers do not break. Inbound CRM mail is removed. */
  projectId?: string | null;
  /** Consultant/host used to resolve the firm contact shown in the footer. */
  replyToUserId?: string | null;
  from?: string;
  automated?: boolean;
  inReplyTo?: string;
  attachments?: { filename: string; content: string }[];
  headers?: Record<string, string>;
}): Promise<SendResendEmailResult> {
  const config = emailConfigured();
  if (!config) return { sent: false, reason: "not_configured" };

  const to = input.to.trim().toLowerCase();
  if (await isEmailSuppressed(to)) {
    return { sent: false, reason: "suppressed" };
  }

  const kind = input.kind ?? "transactional";
  const idempotencyKey =
    input.idempotencyKey ?? emailIdempotencyKey(kind, to, input.subject);

  const locale = toAppLocale(input.locale);
  const explicitReplyTo = input.replyTo?.trim() || undefined;
  const allowReply = Boolean(explicitReplyTo);

  const contact = await resolveFirmContact({
    organizationId: input.organizationId,
    staffUserId: input.replyToUserId,
    organizationName: input.organizationName,
  });

  if (
    !allowReply &&
    input.organizationId &&
    !contact &&
    input.includeDoNotReply !== false
  ) {
    console.error(
      "sendResendEmail: missing firm contact (set rep email or org privacy contact)",
      input.organizationId,
    );
  }

  const sender = input.organizationName
    ? bookingSenderForOrg(input.organizationName)
    : { from: config.from };
  const from = input.from?.trim() || sender?.from || config.from;

  const notice = notificationFooterCopy({
    locale,
    contact,
    allowReply,
  });
  const content = notice
    ? footerNotice(input.html, input.text, notice)
    : { html: input.html, text: input.text };

  const tags = [
    { name: "kind", value: kind.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 256) },
  ];
  if (input.organizationId) {
    tags.push({
      name: "organization-id",
      value: input.organizationId.replace(/[^A-Za-z0-9_-]/g, ""),
    });
  }

  const headers: Record<string, string> = {};
  if (input.automated !== false && !allowReply) {
    headers["Auto-Submitted"] = "auto-generated";
    headers["X-Auto-Response-Suppress"] = "All";
  }
  if (input.inReplyTo) {
    headers["In-Reply-To"] = input.inReplyTo;
    headers["References"] = input.inReplyTo;
  }
  if (input.headers) {
    for (const [key, value] of Object.entries(input.headers)) {
      const trimmed = value.trim();
      if (trimmed) headers[key] = trimmed;
    }
  }

  const resend = getResend(config.apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject: input.subject,
      html: content.html,
      text: content.text,
      replyTo: explicitReplyTo,
      headers: Object.keys(headers).length ? headers : undefined,
      tags,
      attachments: input.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
      })),
    },
    { idempotencyKey: idempotencyKey.slice(0, 256) },
  );

  if (error || !data?.id) {
    console.error("resend email:", error?.message ?? "missing_id");
    await recordOutboundEmail({
      organizationId: input.organizationId,
      kind,
      idempotencyKey,
      resendEmailId: data?.id ?? null,
      to,
      status: "failed",
    });
    return { sent: false, reason: "send_failed" };
  }

  await recordOutboundEmail({
    organizationId: input.organizationId,
    kind,
    idempotencyKey,
    resendEmailId: data.id,
    to,
    status: "sent",
  });

  return { sent: true, id: data.id };
}
