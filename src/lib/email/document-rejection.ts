import { createTranslator } from "next-intl";

import { email } from "@/lib/design-tokens";
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
    namespace: "documentEmail",
  });
}

export async function sendDocumentRejectionEmail(input: {
  locale: string;
  to: string;
  clientName: string;
  organizationName: string;
  organizationId?: string | null;
  projectId: string;
  projectTitle: string;
  documentName: string;
  comment: string;
  shareUrl: string | null;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const subject = t("rejectionSubject", {
    org: input.organizationName,
    document: input.documentName,
  });
  const shareUrl = input.shareUrl ? escapeHtml(input.shareUrl) : null;
  const comment = escapeHtml(input.comment);

  const ctaBlock = shareUrl
    ? `<p style="margin:0 0 24px;">
      <a href="${shareUrl}" style="display:inline-block;background:${email.ctaBg};color:${email.ctaText};text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:10px;">${escapeHtml(t("rejectionCta"))}</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:${email.textMuted};word-break:break-all;">${shareUrl}</p>`
    : `<p style="margin:0;font-size:14px;line-height:1.55;color:${email.textMuted};">${escapeHtml(t("rejectionNoLink"))}</p>`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:${email.bodyBg};font-family:Inter,system-ui,sans-serif;color:${email.text};">
  <div style="max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${email.textMuted};">${escapeHtml(input.organizationName)}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(t("rejectionHeading"))}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${email.textMuted};">${escapeHtml(t("rejectionGreeting", { name: input.clientName }))}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${email.textMuted};">${escapeHtml(t("rejectionIntro", { project: input.projectTitle, document: input.documentName }))}</p>
    <blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid ${email.border};background:${email.bodyBg};font-size:14px;line-height:1.55;color:${email.text};">${comment}</blockquote>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${email.textMuted};">${escapeHtml(t("rejectionAction"))}</p>
    ${ctaBlock}
  </div>
</body>
</html>`;

  const text = [
    t("rejectionGreeting", { name: input.clientName }),
    "",
    t("rejectionIntro", {
      project: input.projectTitle,
      document: input.documentName,
    }),
    "",
    input.comment,
    "",
    t("rejectionAction"),
    input.shareUrl ?? t("rejectionNoLink"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    text,
    kind: "document-rejection",
    idempotencyKey: emailIdempotencyKey(
      "document-rejection",
      input.projectId,
      input.documentName,
      new Date().toISOString().slice(0, 16),
    ),
    organizationName: input.organizationName,
    organizationId: input.organizationId,
    locale,
    projectId: input.projectId,
  });
}
