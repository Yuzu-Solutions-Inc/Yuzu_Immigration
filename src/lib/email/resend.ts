import { email as emailTokens } from "@/lib/design-tokens";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";

const messagesByLocale = { en, fr, es } as const;

function emailConfigured() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BOOKING_FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
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

function doNotReplyCopy(locale: AppLocale) {
  return messagesByLocale[locale].bookingEmail.doNotReply;
}

function withDoNotReplyNotice(html: string, text: string, locale: AppLocale) {
  const notice = doNotReplyCopy(locale);
  const footerHtml = `<div style="max-width:560px;margin:16px auto 0;padding:0 8px;font-size:12px;line-height:1.5;color:${emailTokens.textMuted};">${escapeHtml(notice)}</div>`;
  const htmlOut = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${footerHtml}</body>`)
    : `${html}${footerHtml}`;
  const textOut = `${text.trim()}\n\n—\n${notice}`;
  return { html: htmlOut, text: textOut };
}

/** Per-org From on the verified domain; Reply-To stays the env mailbox. */
export function bookingSenderForOrg(organizationName: string) {
  const configured = emailConfigured();
  if (!configured) return null;
  const parsed = parseFromEnv(configured.from);
  if (!parsed) {
    return { from: configured.from, replyTo: undefined as string | undefined };
  }
  const display = safeDisplayName(`${organizationName} Bookings`);
  const address = `${orgLocalPart(organizationName)}+Bookings@${parsed.domain}`;
  return {
    from: `${display} <${address}>`,
    replyTo: parsed.email,
  };
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  organizationName?: string;
  locale?: string;
  includeDoNotReply?: boolean;
  replyTo?: string;
}) {
  const config = emailConfigured();
  if (!config) return { sent: false as const, reason: "not_configured" as const };

  const locale = toAppLocale(input.locale);
  const sender = input.organizationName
    ? bookingSenderForOrg(input.organizationName)
    : { from: config.from, replyTo: parseFromEnv(config.from)?.email };
  const content =
    input.includeDoNotReply === false
      ? { html: input.html, text: input.text }
      : withDoNotReplyNotice(input.html, input.text, locale);

  const body: Record<string, unknown> = {
    from: sender?.from ?? config.from,
    to: [input.to],
    subject: input.subject,
    html: content.html,
    text: content.text,
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
    },
  };
  if (input.replyTo) body.reply_to = input.replyTo;
  else if (sender?.replyTo) body.reply_to = sender.replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("resend email:", response.status, errorBody.slice(0, 240));
    return { sent: false as const, reason: "send_failed" as const };
  }

  return { sent: true as const };
}
