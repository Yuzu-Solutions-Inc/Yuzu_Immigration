import "server-only";

import { createTranslator } from "next-intl";

import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import {
  TRIAL_EMAIL_KINDS,
  TRIAL_EMAIL_OFFSET_DAYS,
  trialAgeDays,
} from "@/lib/billing/trial";
import { emailStyle } from "@/lib/email/styles";
import { sendResendEmail, emailIdempotencyKey } from "@/lib/email/resend";
import {
  trialUnsubscribeToken,
} from "@/lib/email/trial-unsubscribe";
import { PRICING } from "@/lib/marketing/pricing";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { createServiceClient } from "@/lib/supabase/admin";

type TrialEmailKind = keyof typeof TRIAL_EMAIL_KINDS;

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
    messages: dictionaries[locale],
    namespace: "trialEmail",
  });
}

async function orgAdminRecipients(organizationId: string) {
  const admin = createServiceClient();
  const { data: members, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "admin");
  if (error) {
    console.error("trial email members:", error.message);
    return [];
  }
  const userIds = (members ?? []).map((row) => row.user_id as string);
  if (userIds.length === 0) return [];
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name, preferred_locale, trial_email_unsubscribed_at")
    .in("id", userIds);
  if (profileError) {
    console.error("trial email profiles:", profileError.message);
    return [];
  }
  return (profiles ?? [])
    .filter((row) => !row.trial_email_unsubscribed_at)
    .map((row) => ({
      userId: row.id as string,
      email: ((row.email as string | null) ?? "").trim().toLowerCase(),
      name: ((row.full_name as string | null) ?? "").trim(),
      locale: toAppLocale(row.preferred_locale as string | null),
    }))
    .filter((row) => row.email.includes("@"));
}

async function sendTrialEmail(input: {
  kind: TrialEmailKind;
  organizationId: string;
  recipient: {
    userId: string;
    email: string;
    name: string;
    locale: AppLocale;
  };
  daysLeft: number;
}) {
  const locale = input.recipient.locale;
  const t = translator(locale);
  const greeting = input.recipient.name
    ? t("greeting", { name: input.recipient.name })
    : t("greetingGeneric");
  const baseUrl = await getAppBaseUrl();
  const homeUrl = `${baseUrl}/${locale}/home`;
  const unsubToken = trialUnsubscribeToken(input.recipient.userId);
  const unsubPageUrl = unsubToken
    ? `${baseUrl}/${locale}/unsubscribe/trial?t=${encodeURIComponent(unsubToken)}`
    : null;
  const unsubApiUrl = unsubToken
    ? `${baseUrl}/api/email/unsubscribe/trial?t=${encodeURIComponent(unsubToken)}`
    : null;
  const intro =
    input.kind === "welcome"
      ? t("welcomeIntro", { count: PRICING.trialDays })
      : t("reminderIntro", { count: input.daysLeft });
  const subject =
    input.kind === "welcome"
      ? t("welcomeSubject")
      : t("reminderSubject", { count: input.daysLeft });
  const heading =
    input.kind === "welcome" ? t("welcomeHeading") : t("reminderHeading");
  const questions =
    input.kind === "welcome" ? null : t("questions");

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<body style="${emailStyle.body}">
  <div style="${emailStyle.cardCompact}">
    <p style="${emailStyle.eyebrowStrong}">${escapeHtml(product.name)}</p>
    <h1 style="${emailStyle.heading}">${escapeHtml(heading)}</h1>
    <p style="${emailStyle.mutedTight}">${escapeHtml(greeting)}</p>
    <p style="${emailStyle.muted}">${escapeHtml(intro)}</p>
    ${questions ? `<p style="${emailStyle.muted}">${escapeHtml(questions)}</p>` : ""}
    <p style="margin:0 0 16px;">
      <a href="${escapeHtml(homeUrl)}" style="${emailStyle.ctaCompact}">${escapeHtml(t("cta"))}</a>
    </p>
    <p style="${emailStyle.mutedSmall}">${escapeHtml(t("replyHint", { email: product.supportEmail }))}</p>
    ${
      unsubPageUrl
        ? `<p style="${emailStyle.borderTop}"><a href="${escapeHtml(unsubPageUrl)}" style="${emailStyle.linkMuted}">${escapeHtml(t("unsubscribe"))}</a></p>`
        : ""
    }
  </div>
</body>
</html>`;

  const text = [
    greeting,
    "",
    intro,
    ...(questions ? ["", questions] : []),
    "",
    t("cta"),
    homeUrl,
    "",
    t("replyHint", { email: product.supportEmail }),
    ...(unsubPageUrl
      ? ["", `${t("unsubscribe")}: ${unsubPageUrl}`]
      : []),
  ].join("\n");

  const kindKey = TRIAL_EMAIL_KINDS[input.kind];
  const idempotencyKey = emailIdempotencyKey(
    kindKey,
    input.organizationId,
    input.recipient.userId,
  );
  const admin = createServiceClient();
  const { data: prior } = await admin
    .from("outbound_emails")
    .select("status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (
    prior?.status === "sent" ||
    prior?.status === "delivered" ||
    prior?.status === "suppressed"
  ) {
    return { sent: false, reason: "already_sent" as const };
  }

  return sendResendEmail({
    to: input.recipient.email,
    subject,
    html,
    text,
    kind: kindKey,
    locale,
    organizationId: input.organizationId,
    replyTo: product.supportEmail,
    idempotencyKey,
    headers: unsubApiUrl
      ? {
          "List-Unsubscribe": `<${unsubApiUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  });
}

export async function sendTrialEmailsForOrg(
  organizationId: string,
  kind: TrialEmailKind,
) {
  const admin = createServiceClient();
  const { data: org, error } = await admin
    .from("organizations")
    .select("id, name, default_locale, trial_started_at, subscribed_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("trial email org:", error.message);
    return { sent: 0 };
  }
  if (!org || org.subscribed_at) return { sent: 0 };

  const age = trialAgeDays(org.trial_started_at as string);
  const daysLeft = Math.max(0, PRICING.trialDays - age);
  const recipients = await orgAdminRecipients(organizationId);
  let sent = 0;
  for (const recipient of recipients) {
    const result = await sendTrialEmail({
      kind,
      organizationId,
      recipient,
      daysLeft,
    });
    if (result.sent) sent += 1;
  }
  return { sent };
}

export async function processDueTrialEmails(now = new Date()) {
  const admin = createServiceClient();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, trial_started_at, subscribed_at")
    .is("subscribed_at", null);
  if (error) {
    console.error("trial email cron orgs:", error.message);
    return { processed: 0, sent: 0 };
  }

  let processed = 0;
  let sent = 0;
  for (const org of orgs ?? []) {
    const age = trialAgeDays(org.trial_started_at as string, now);
    if (age >= PRICING.trialDays) continue;
    processed += 1;
    const due: TrialEmailKind[] = [];
    if (age >= TRIAL_EMAIL_OFFSET_DAYS.welcome) due.push("welcome");
    if (age >= TRIAL_EMAIL_OFFSET_DAYS.week1) due.push("week1");
    if (age >= TRIAL_EMAIL_OFFSET_DAYS.week2) due.push("week2");
    if (age >= TRIAL_EMAIL_OFFSET_DAYS.week3) due.push("week3");
    for (const kind of due) {
      const result = await sendTrialEmailsForOrg(org.id as string, kind);
      sent += result.sent;
    }
  }
  return { processed, sent };
}
