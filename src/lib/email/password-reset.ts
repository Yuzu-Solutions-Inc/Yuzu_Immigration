import { createTranslator } from "next-intl";

import { product } from "@/lib/brand/product";
import { emailStyle } from "@/lib/email/styles";
import { sendResendEmail, emailIdempotencyKey } from "@/lib/email/resend";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { dictionaries } from "@/lib/i18n/dictionaries";

const messagesByLocale = dictionaries;

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
    namespace: "passwordResetEmail",
  });
}

export async function sendPasswordResetEmail(input: {
  locale: string;
  to: string;
  resetUrl: string;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const resetUrl = escapeHtml(input.resetUrl);

  const html = `<!DOCTYPE html>
<html>
<body style="${emailStyle.body}">
  <div style="${emailStyle.cardCompact}">
    <p style="${emailStyle.eyebrowStrong}">${escapeHtml(product.name)}</p>
    <h1 style="${emailStyle.heading}">${escapeHtml(t("heading"))}</h1>
    <p style="${emailStyle.mutedTight}">${escapeHtml(t("greetingGeneric"))}</p>
    <p style="${emailStyle.muted}">${escapeHtml(t("intro"))}</p>
    <p style="margin:0 0 16px;">
      <a href="${resetUrl}" style="${emailStyle.ctaCompact}">${escapeHtml(t("cta"))}</a>
    </p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("footer"))}</p>
    <p style="${emailStyle.mutedSmall}">${resetUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    t("greetingGeneric"),
    "",
    t("intro"),
    "",
    t("cta"),
    input.resetUrl,
    "",
    t("footer"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject: t("subject"),
    html,
    text,
    kind: "password-reset",
    idempotencyKey: emailIdempotencyKey(
      "password-reset",
      input.to,
      input.resetUrl.slice(-32),
    ),
  });
}
