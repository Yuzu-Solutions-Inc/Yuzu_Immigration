import { createTranslator } from "next-intl";

import { isSafeManageUrl } from "@/lib/booking/manage-url";
import { formatDateTimeInZone } from "@/lib/booking/timezone";
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
    namespace: "bookingEmail",
  });
}

function safeLink(url?: string | null) {
  if (!url || !isSafeManageUrl(url)) return null;
  return url;
}

function detailsTable(
  t: ReturnType<typeof translator>,
  when: string,
  timezone: string,
  hostName: string,
  serviceTitle: string,
) {
  return `<table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr>
          <td style="padding:8px 0;color:${email.textMuted};width:140px;">${escapeHtml(t("when"))}</td>
          <td style="padding:8px 0;color:${email.text};font-weight:600;">${escapeHtml(when)}<br /><span style="font-weight:400;color:${email.textMuted};">${escapeHtml(timezone)}</span></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${email.textMuted};">${escapeHtml(t("consultant"))}</td>
          <td style="padding:8px 0;color:${email.text};font-weight:600;">${escapeHtml(hostName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${email.textMuted};">${escapeHtml(t("service"))}</td>
          <td style="padding:8px 0;color:${email.text};font-weight:600;">${escapeHtml(serviceTitle)}</td>
        </tr>
      </table>`;
}

function manageLinksHtml(
  t: ReturnType<typeof translator>,
  manageUrl: string | null,
  cancelUrl: string | null,
) {
  if (!manageUrl && !cancelUrl) return "";
  const change = manageUrl
    ? `<a href="${escapeHtml(manageUrl)}" style="color:${email.link};font-weight:600;text-decoration:none;">${escapeHtml(t("changeTime"))}</a>`
    : "";
  const cancel = cancelUrl
    ? `<a href="${escapeHtml(cancelUrl)}" style="color:${email.textMuted};font-weight:600;text-decoration:none;">${escapeHtml(t("cancelAppointment"))}</a>`
    : "";
  const separator =
    change && cancel
      ? `<span style="color:${email.border};margin:0 10px;">|</span>`
      : "";
  return `<p style="margin:24px 0 0;font-size:15px;color:${email.textMuted};">${escapeHtml(t("manageIntro"))}</p>
      <p style="margin:12px 0 0;">${change}${separator}${cancel}</p>`;
}

export async function sendBookingConfirmationEmail(input: {
  locale: string;
  to: string;
  guestName: string;
  organizationName: string;
  hostName: string;
  serviceTitle: string;
  startsAt: string;
  timezone: string;
  meetJoinUrl?: string | null;
  manageUrl?: string | null;
  cancelUrl?: string | null;
  variant?: "confirmed" | "updated";
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const when = formatDateTimeInZone(
    new Date(input.startsAt),
    input.timezone,
    locale,
  );
  const meet =
    input.meetJoinUrl?.startsWith("https://") ? input.meetJoinUrl : null;
  const manageUrl = safeLink(input.manageUrl);
  const cancelUrl = safeLink(input.cancelUrl);
  const updated = input.variant === "updated";

  const subject = updated
    ? t("updatedSubject", { service: input.serviceTitle })
    : t("subject", { service: input.serviceTitle });
  const heading = updated ? t("updatedHeading") : t("heading");
  const intro = updated
    ? t("updatedIntro", { org: input.organizationName })
    : t("intro", { org: input.organizationName });
  const textLines = [
    t("greeting", { name: input.guestName }),
    heading,
    intro,
    `${t("when")}: ${when} (${input.timezone})`,
    `${t("consultant")}: ${input.hostName}`,
    `${t("service")}: ${input.serviceTitle}`,
    meet ? `${t("joinMeet")}: ${meet}` : null,
    manageUrl || cancelUrl ? t("manageIntro") : null,
    manageUrl ? `${t("changeTime")}: ${manageUrl}` : null,
    cancelUrl ? `${t("cancelAppointment")}: ${cancelUrl}` : null,
    t("footer"),
  ].filter((line): line is string => Boolean(line));

  const meetHtml = meet
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(meet)}" style="display:inline-block;background:${email.ctaBg};color:${email.ctaText};text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;">${escapeHtml(t("joinMeet"))}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:${email.bodyBg};color:${email.text};font-family:Inter,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px 24px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${email.textMuted};">${escapeHtml(input.organizationName)}</p>
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:${email.heading};">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${email.text};">${escapeHtml(t("greeting", { name: input.guestName }))}</p>
      <p style="margin:0 0 20px;font-size:15px;color:${email.textMuted};">${escapeHtml(intro)}</p>
      ${detailsTable(t, when, input.timezone, input.hostName, input.serviceTitle)}
      ${meetHtml}
      ${manageLinksHtml(t, manageUrl, cancelUrl)}
      <p style="margin:28px 0 0;font-size:13px;color:${email.textMuted};">${escapeHtml(t("footer"))}</p>
    </div>
  </body>
</html>`;

  try {
    await sendResendEmail({
      to: input.to,
      subject,
      html,
      text: textLines.join("\n"),
      organizationName: input.organizationName,
      locale: input.locale,
    });
  } catch (error) {
    console.error("booking confirmation email:", error);
  }
}

export async function sendBookingCancelledEmail(input: {
  locale: string;
  to: string;
  guestName: string;
  organizationName: string;
  hostName: string;
  serviceTitle: string;
  startsAt: string;
  timezone: string;
  /** Who initiated the cancellation. Organization sends rebook CTA. */
  cancelledBy?: "guest" | "organization";
  bookingUrl?: string | null;
}) {
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const when = formatDateTimeInZone(
    new Date(input.startsAt),
    input.timezone,
    locale,
  );
  const byOrg = input.cancelledBy === "organization";
  const intro = byOrg
    ? t("cancelledByOrgIntro", { org: input.organizationName })
    : t("cancelledIntro", { org: input.organizationName });
  const footer = byOrg ? t("cancelledByOrgFooter") : t("cancelledFooter");
  const bookingUrl = safeLink(input.bookingUrl);
  const subject = t("cancelledSubject", { service: input.serviceTitle });
  const textLines = [
    t("greeting", { name: input.guestName }),
    t("cancelledHeading"),
    intro,
    `${t("when")}: ${when} (${input.timezone})`,
    `${t("consultant")}: ${input.hostName}`,
    `${t("service")}: ${input.serviceTitle}`,
    bookingUrl ? `${t("bookAgain")}: ${bookingUrl}` : null,
    footer,
  ].filter((line): line is string => Boolean(line));

  const bookHtml = bookingUrl
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:${email.ctaBg};color:${email.ctaText};text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600;">${escapeHtml(t("bookAgain"))}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:${email.bodyBg};color:${email.text};font-family:Inter,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px 24px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${email.textMuted};">${escapeHtml(input.organizationName)}</p>
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:${email.heading};">${escapeHtml(t("cancelledHeading"))}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${email.text};">${escapeHtml(t("greeting", { name: input.guestName }))}</p>
      <p style="margin:0 0 20px;font-size:15px;color:${email.textMuted};">${escapeHtml(intro)}</p>
      ${detailsTable(t, when, input.timezone, input.hostName, input.serviceTitle)}
      ${bookHtml}
      <p style="margin:28px 0 0;font-size:13px;color:${email.textMuted};">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;

  try {
    await sendResendEmail({
      to: input.to,
      subject,
      html,
      text: textLines.join("\n"),
      organizationName: input.organizationName,
      locale: input.locale,
    });
  } catch (error) {
    console.error("booking cancelled email:", error);
  }
}

export async function sendBookingManageLinksEmail(input: {
  locale: string;
  to: string;
  guestName: string;
  organizationName: string;
  timezone: string;
  appointments: {
    serviceTitle: string;
    hostName: string;
    startsAt: string;
    manageUrl: string;
    cancelUrl: string;
  }[];
}) {
  if (input.appointments.length === 0) return;
  const locale = toAppLocale(input.locale);
  const t = translator(locale);
  const items = input.appointments
    .map((appointment) => {
      const manageUrl = safeLink(appointment.manageUrl);
      const cancelUrl = safeLink(appointment.cancelUrl);
      if (!manageUrl && !cancelUrl) return null;
      const when = formatDateTimeInZone(
        new Date(appointment.startsAt),
        input.timezone,
        locale,
      );
      return { ...appointment, when, manageUrl, cancelUrl };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (items.length === 0) return;

  const subject = t("manageLinksSubject", { org: input.organizationName });
  const textLines = [
    t("greeting", { name: input.guestName }),
    t("manageLinksIntro", { org: input.organizationName }),
    ...items.flatMap((item) => [
      `${item.serviceTitle} — ${item.when} (${input.timezone}) — ${item.hostName}`,
      item.manageUrl ? `${t("changeTime")}: ${item.manageUrl}` : null,
      item.cancelUrl ? `${t("cancelAppointment")}: ${item.cancelUrl}` : null,
    ]),
    t("manageLinksFooter"),
  ].filter((line): line is string => Boolean(line));

  const itemsHtml = items
    .map((item) => {
      const links = manageLinksHtml(t, item.manageUrl, item.cancelUrl);
      return `<div style="margin:20px 0 0;padding:16px 0 0;border-top:1px solid ${email.border};">
        ${detailsTable(t, item.when, input.timezone, item.hostName, item.serviceTitle)}
        ${links}
      </div>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:${email.bodyBg};color:${email.text};font-family:Inter,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px 24px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${email.textMuted};">${escapeHtml(input.organizationName)}</p>
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:${email.heading};">${escapeHtml(t("manageLinksHeading"))}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${email.text};">${escapeHtml(t("greeting", { name: input.guestName }))}</p>
      <p style="margin:0 0 8px;font-size:15px;color:${email.textMuted};">${escapeHtml(t("manageLinksIntro", { org: input.organizationName }))}</p>
      ${itemsHtml}
      <p style="margin:28px 0 0;font-size:13px;color:${email.textMuted};">${escapeHtml(t("manageLinksFooter"))}</p>
    </div>
  </body>
</html>`;

  try {
    await sendResendEmail({
      to: input.to,
      subject,
      html,
      text: textLines.join("\n"),
      organizationName: input.organizationName,
      locale: input.locale,
    });
  } catch (error) {
    console.error("booking manage links email:", error);
  }
}
