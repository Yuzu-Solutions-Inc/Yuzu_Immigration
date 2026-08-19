import { createTranslator } from "next-intl";

import { emailStyle } from "@/lib/email/styles";
import { sendResendEmail } from "@/lib/email/resend";
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
    namespace: "contractEmail",
  });
}

function wrap(htmlInner: string) {
  return `<!doctype html>
<html>
  <body style="${emailStyle.body}">
    <div style="${emailStyle.card}">
      ${htmlInner}
    </div>
  </body>
</html>`;
}

export async function sendContractSignatureRequestEmail(input: {
  locale: string;
  organizationName: string;
  to: string;
  signerName: string;
  contractTitle: string;
  signUrl: string;
  role: "client" | "consultant";
}) {
  if (!input.to.includes("@")) return { sent: false as const };
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const heading =
    input.role === "consultant" ? t("consultantHeading") : t("heading");
  const intro =
    input.role === "consultant"
      ? t("consultantIntro", { org: input.organizationName })
      : t("intro", { org: input.organizationName });
  const html = wrap(`
      <p style="${emailStyle.eyebrow}">${escapeHtml(input.organizationName)}</p>
      <h1 style="${emailStyle.heading}">${escapeHtml(heading)}</h1>
      <p style="${emailStyle.muted}">${escapeHtml(t("greeting", { name: input.signerName }))}</p>
      <p style="${emailStyle.muted}">${escapeHtml(intro)}</p>
      <p style="${emailStyle.text}"><strong>${escapeHtml(input.contractTitle)}</strong></p>
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(input.signUrl)}" style="${emailStyle.cta}">${escapeHtml(t("cta"))}</a>
      </p>
      <p style="${emailStyle.footer}">${escapeHtml(t("footer"))}</p>
  `);
  const text = [
    t("greeting", { name: input.signerName }),
    intro,
    input.contractTitle,
    input.signUrl,
    t("footer"),
  ].join("\n\n");
  return sendResendEmail({
    to: input.to,
    subject: t("subject", { title: input.contractTitle }),
    html,
    text,
    organizationName: input.organizationName,
    locale,
  });
}

export async function sendContractCompletedEmail(input: {
  locale: string;
  organizationName: string;
  to: string;
  signerName: string;
  contractTitle: string;
  pdfBytes: Uint8Array;
}) {
  if (!input.to.includes("@")) return { sent: false as const };
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const html = wrap(`
      <p style="${emailStyle.eyebrow}">${escapeHtml(input.organizationName)}</p>
      <h1 style="${emailStyle.heading}">${escapeHtml(t("completedHeading"))}</h1>
      <p style="${emailStyle.muted}">${escapeHtml(t("greeting", { name: input.signerName }))}</p>
      <p style="${emailStyle.muted}">${escapeHtml(t("completedIntro", { org: input.organizationName }))}</p>
      <p style="${emailStyle.text}"><strong>${escapeHtml(input.contractTitle)}</strong></p>
      <p style="${emailStyle.footer}">${escapeHtml(t("completedFooter"))}</p>
  `);
  const filename = `${input.contractTitle.replace(/[^\w.-]+/g, "_").slice(0, 60) || "contract"}-signed.pdf`;
  return sendResendEmail({
    to: input.to,
    subject: t("completedSubject", { title: input.contractTitle }),
    html,
    text: [
      t("greeting", { name: input.signerName }),
      t("completedIntro", { org: input.organizationName }),
      input.contractTitle,
      t("completedFooter"),
    ].join("\n\n"),
    organizationName: input.organizationName,
    locale,
    attachments: [
      {
        filename,
        content: Buffer.from(input.pdfBytes).toString("base64"),
      },
    ],
  });
}
