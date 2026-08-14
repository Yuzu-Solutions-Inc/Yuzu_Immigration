import { createTranslator } from "next-intl";

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
    namespace: "bookingEmail",
  });
}

export async function sendProjectCallInviteEmail(input: {
  locale: string;
  to: string;
  guestName: string;
  organizationName: string;
  hostName: string;
  projectTitle: string;
  bookUrl: string;
  expiresAt: string;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const expires = new Date(input.expiresAt).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );

  const subject = t("callInviteSubject", {
    org: input.organizationName,
  });
  const bookUrl = escapeHtml(input.bookUrl);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#F9F9F9;font-family:Inter,system-ui,sans-serif;color:#2D3436;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:28px;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#8B9294;">${escapeHtml(input.organizationName)}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(t("callInviteHeading"))}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#8B9294;">${escapeHtml(t("callInviteGreeting", { name: input.guestName }))}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#8B9294;">${escapeHtml(t("callInviteIntro", { org: input.organizationName, host: input.hostName, project: input.projectTitle }))}</p>
    <p style="margin:0 0 24px;">
      <a href="${bookUrl}" style="display:inline-block;background:#86C54A;color:#0F1213;text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:10px;">${escapeHtml(t("callInviteCta"))}</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#8B9294;">${escapeHtml(t("callInviteExpiry", { date: expires }))}</p>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#8B9294;word-break:break-all;">${bookUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    t("callInviteGreeting", { name: input.guestName }),
    "",
    t("callInviteIntro", {
      org: input.organizationName,
      host: input.hostName,
      project: input.projectTitle,
    }),
    "",
    t("callInviteCta"),
    input.bookUrl,
    "",
    t("callInviteExpiry", { date: expires }),
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
