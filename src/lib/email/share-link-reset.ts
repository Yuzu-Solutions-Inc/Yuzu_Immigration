import { createTranslator } from "next-intl";

import { email } from "@/lib/design-tokens";
import { sendResendEmail } from "@/lib/email/resend";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";

const messagesByLocale = { en, fr, es } as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function translator(locale: AppLocale) {
  return createTranslator({
    locale,
    messages: messagesByLocale[locale],
    namespace: "shareLinkEmail",
  });
}

export async function sendShareLinkResetEmail(input: {
  locale: string;
  to: string;
  clientName: string;
  organizationName: string;
  projectTitle: string;
  shareUrl: string;
  expiresAt: string;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const expires = new Date(input.expiresAt).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );

  const subject = t("resetSubject", { org: input.organizationName });
  const shareUrl = escapeHtml(input.shareUrl);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:${email.bodyBg};font-family:Inter,system-ui,sans-serif;color:${email.text};">
  <div style="max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${email.textMuted};">${escapeHtml(input.organizationName)}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(t("resetHeading"))}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${email.textMuted};">${escapeHtml(t("resetGreeting", { name: input.clientName }))}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${email.textMuted};">${escapeHtml(t("resetIntro", { project: input.projectTitle }))}</p>
    <p style="margin:0 0 24px;">
      <a href="${shareUrl}" style="display:inline-block;background:${email.ctaBg};color:${email.ctaText};text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:10px;">${escapeHtml(t("resetCta"))}</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:${email.textMuted};">${escapeHtml(t("resetExpiry", { date: expires }))}</p>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${email.textMuted};word-break:break-all;">${shareUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    t("resetGreeting", { name: input.clientName }),
    "",
    t("resetIntro", { project: input.projectTitle }),
    "",
    t("resetCta"),
    input.shareUrl,
    "",
    t("resetExpiry", { date: expires }),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    text,
    organizationName: input.organizationName,
    locale,
  });
}
