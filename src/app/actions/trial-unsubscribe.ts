"use server";

import { redirect } from "next/navigation";

import { applyTrialEmailUnsubscribe } from "@/lib/email/trial-unsubscribe";
import { toAppLocale } from "@/lib/i18n/locales";

export async function unsubscribeTrialEmailsAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  const result = await applyTrialEmailUnsubscribe(token);
  const params = new URLSearchParams();
  params.set("t", token);
  if (result.ok) params.set("done", "1");
  else params.set("error", "1");
  redirect(`/${locale}/unsubscribe/trial?${params.toString()}`);
}
