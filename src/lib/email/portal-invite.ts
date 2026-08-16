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
    namespace: "portalEmail",
  });
}

export async function sendPortalInviteEmail(input: {
  locale: string;
  to: string;
  clientName: string;
  organizationName: string;
  portalUrl: string;
  accessCode: string;
  reset?: boolean;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const portalUrl = escapeHtml(input.portalUrl);
  const heading = input.reset ? t("resetHeading") : t("inviteHeading");
  const intro = input.reset
    ? t("resetIntro", { org: input.organizationName })
    : t("inviteIntro", { org: input.organizationName });
  const subject = input.reset
    ? t("resetSubject", { org: input.organizationName })
    : t("inviteSubject", { org: input.organizationName });

  const html = `<!DOCTYPE html>
<html>
<body style="${emailStyle.body}">
  <div style="${emailStyle.cardCompact}">
    <p style="${emailStyle.eyebrowStrong}">${escapeHtml(input.organizationName)}</p>
    <h1 style="${emailStyle.heading}">${escapeHtml(heading)}</h1>
    <p style="${emailStyle.mutedTight}">${escapeHtml(t("greeting", { name: input.clientName }))}</p>
    <p style="${emailStyle.muted}">${escapeHtml(intro)}</p>
    <p style="margin:0 0 16px;">
      <a href="${portalUrl}" style="${emailStyle.ctaCompact}">${escapeHtml(t("cta"))}</a>
    </p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("accessCodeLabel"))}: <strong>${escapeHtml(input.accessCode)}</strong></p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("footer"))}</p>
    <p style="${emailStyle.mutedSmall}">${portalUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    t("greeting", { name: input.clientName }),
    "",
    intro,
    "",
    t("cta"),
    input.portalUrl,
    "",
    `${t("accessCodeLabel")}: ${input.accessCode}`,
    "",
    t("footer"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    text,
  });
}
