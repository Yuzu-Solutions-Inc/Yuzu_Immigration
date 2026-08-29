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
    namespace: "orgInviteEmail",
  });
}

export async function sendOrgInviteEmail(input: {
  locale: string;
  to: string;
  organizationName: string;
  organizationId: string;
  roleLabel: string;
  inviteUrl: string;
  invitedByUserId?: string | null;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const org = escapeHtml(input.organizationName);
  const intro = t("intro", {
    org: input.organizationName,
    role: input.roleLabel,
    email: input.to,
  });

  const html = `<!DOCTYPE html>
<html>
<body style="${emailStyle.body}">
  <div style="${emailStyle.cardCompact}">
    <p style="${emailStyle.eyebrowStrong}">${org}</p>
    <h1 style="${emailStyle.heading}">${escapeHtml(t("heading", { org: input.organizationName }))}</h1>
    <p style="${emailStyle.mutedTight}">${escapeHtml(t("greetingGeneric"))}</p>
    <p style="${emailStyle.muted}">${escapeHtml(intro)}</p>
    <p style="margin:0 0 16px;">
      <a href="${inviteUrl}" style="${emailStyle.ctaCompact}">${escapeHtml(t("cta"))}</a>
    </p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("footer"))}</p>
    <p style="${emailStyle.mutedSmall}">${inviteUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    t("greetingGeneric"),
    "",
    intro,
    "",
    t("cta"),
    input.inviteUrl,
    "",
    t("footer"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject: t("subject", { org: input.organizationName }),
    html,
    text,
    kind: "org-invite",
    idempotencyKey: emailIdempotencyKey(
      "org-invite",
      input.to,
      input.inviteUrl.slice(-32),
    ),
    organizationName: input.organizationName,
    organizationId: input.organizationId,
    locale,
    replyToUserId: input.invitedByUserId,
  });
}
