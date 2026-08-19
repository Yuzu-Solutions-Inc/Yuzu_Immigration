import { createTranslator } from "next-intl";

import { emailStyle } from "@/lib/email/styles";
import { sendResendEmail } from "@/lib/email/resend";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { CLOSED_FILE_RETENTION_YEARS } from "@/lib/privacy/retention";
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
    namespace: "portalDeletionEmail",
  });
}

export async function sendPortalDeletionRequestEmail(input: {
  locale: string;
  to: string;
  organizationName: string;
  clientName: string;
  clientEmail: string | null;
  personId: string;
  note: string | null;
  projectTitles: string[];
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const years = String(CLOSED_FILE_RETENTION_YEARS);
  const files =
    input.projectTitles.length > 0
      ? input.projectTitles.map((title) => `• ${title}`).join("\n")
      : t("noFiles");
  const note = input.note?.trim() || t("noNote");
  const clientEmail = input.clientEmail?.trim() || t("noEmail");

  const html = `<!DOCTYPE html>
<html>
<body style="${emailStyle.body}">
  <div style="${emailStyle.cardCompact}">
    <p style="${emailStyle.eyebrowStrong}">${escapeHtml(input.organizationName)}</p>
    <h1 style="${emailStyle.heading}">${escapeHtml(t("heading"))}</h1>
    <p style="${emailStyle.muted}">${escapeHtml(t("intro", { name: input.clientName }))}</p>
    <p style="${emailStyle.mutedTight}">${escapeHtml(t("emailLabel"))}: ${escapeHtml(clientEmail)}</p>
    <p style="${emailStyle.mutedTight}">${escapeHtml(t("personId"))}: ${escapeHtml(input.personId)}</p>
    <p style="${emailStyle.muted}">${escapeHtml(t("filesLabel"))}</p>
    <p style="${emailStyle.mutedTight}">${escapeHtml(files).replaceAll("\n", "<br/>")}</p>
    <p style="${emailStyle.muted}">${escapeHtml(t("noteLabel"))}: ${escapeHtml(note)}</p>
    <p style="${emailStyle.muted}">${escapeHtml(t("retention", { years }))}</p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("footer"))}</p>
  </div>
</body>
</html>`;

  const text = [
    t("heading"),
    "",
    t("intro", { name: input.clientName }),
    `${t("emailLabel")}: ${clientEmail}`,
    `${t("personId")}: ${input.personId}`,
    "",
    t("filesLabel"),
    files,
    "",
    `${t("noteLabel")}: ${note}`,
    "",
    t("retention", { years }),
    "",
    t("footer"),
  ].join("\n");

  return sendResendEmail({
    to: input.to,
    subject: t("subject", { org: input.organizationName, name: input.clientName }),
    html,
    text,
    organizationName: input.organizationName,
    locale,
    includeDoNotReply: false,
    replyTo: input.clientEmail || undefined,
  });
}
