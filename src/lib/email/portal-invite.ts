import { createTranslator } from "next-intl";

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
    namespace: "portalEmail",
  });
}

export async function sendPortalInviteEmail(input: {
  locale: string;
  to: string;
  clientName: string;
  organizationName: string;
  organizationId?: string | null;
  personId: string;
  portalUrl: string;
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
    t("footer"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    text,
    kind: input.reset ? "portal-invite-reset" : "portal-invite",
    idempotencyKey: emailIdempotencyKey(
      input.reset ? "portal-invite-reset" : "portal-invite",
      input.personId,
      new Date().toISOString().slice(0, 16),
    ),
    organizationName: input.organizationName,
    organizationId: input.organizationId,
    locale,
  });
}
