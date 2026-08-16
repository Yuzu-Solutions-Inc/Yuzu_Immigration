"use server";

import { redirect } from "next/navigation";

import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { getPrimaryMembership } from "@/lib/auth/session";
import { safeInternalPath } from "@/lib/auth/next-path";
import { replacePathLocale } from "@/lib/i18n/locales";
import {
  formAcceptedLegal,
  legalAcceptanceMetadata,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

export type AcceptLegalState = {
  error?: "legal_required" | "save_failed";
};

export async function acceptLegalAction(
  _prev: AcceptLegalState,
  formData: FormData,
): Promise<AcceptLegalState> {
  if (!formAcceptedLegal(formData)) {
    return { error: "legal_required" };
  }

  const locale = String(formData.get("locale") || "en");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { error } = await supabase.auth.updateUser({
    data: legalAcceptanceMetadata(),
  });

  if (error) {
    console.error("acceptLegalAction:", error.message);
    return { error: "save_failed" };
  }

  await acceptPendingInvitationsForUser();
  const membership = await getPrimaryMembership();
  const fallback = membership
    ? `/${membership.organization.defaultLocale}/home`
    : `/${locale}/onboarding`;
  const next = safeInternalPath(formData.get("next"), fallback);
  redirect(
    membership
      ? replacePathLocale(next, membership.organization.defaultLocale)
      : next,
  );
}
