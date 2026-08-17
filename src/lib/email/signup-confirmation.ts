import { createTranslator } from "next-intl";

import { emailStyle } from "@/lib/email/styles";
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
    namespace: "authEmail",
  });
}

export async function sendSignupConfirmationEmail(input: {
  locale: string;
  to: string;
  confirmUrl: string;
  fullName?: string;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const name = input.fullName?.trim();
  const greeting = name ? t("greeting", { name }) : t("greetingGeneric");
  const confirmUrl = escapeHtml(input.confirmUrl);

  const html = `<!DOCTYPE html>
<html>
<body style="${emailStyle.body}">
  <div style="${emailStyle.cardCompact}">
    <p style="${emailStyle.eyebrowStrong}">Yuzu Immigration</p>
    <h1 style="${emailStyle.heading}">${escapeHtml(t("heading"))}</h1>
    <p style="${emailStyle.mutedTight}">${escapeHtml(greeting)}</p>
    <p style="${emailStyle.muted}">${escapeHtml(t("intro"))}</p>
    <p style="margin:0 0 16px;">
      <a href="${confirmUrl}" style="${emailStyle.ctaCompact}">${escapeHtml(t("cta"))}</a>
    </p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("footer"))}</p>
    <p style="${emailStyle.mutedSmall}">${confirmUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    greeting,
    "",
    t("intro"),
    "",
    t("cta"),
    input.confirmUrl,
    "",
    t("footer"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject: t("subject"),
    html,
    text,
  });
}
