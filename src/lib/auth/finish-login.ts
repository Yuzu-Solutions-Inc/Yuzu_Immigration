import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { getPrimaryMembership } from "@/lib/auth/session";
import { isAppLocale, replacePathLocale } from "@/lib/i18n/locales";
import {
  hasAcceptedLegal,
  LEGAL_ACCEPT_COOKIE,
  legalAcceptanceMetadata,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

function localeFromPath(path: string) {
  const segment = path.split("/")[1];
  return isAppLocale(segment) ? segment : "en";
}

/** After a session exists: legal acceptance, invitations, then redirect. */
export async function finishSignedInRedirect(nextPath: string): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const jar = await cookies();
  let accepted = hasAcceptedLegal(user);
  if (user && !accepted && jar.get(LEGAL_ACCEPT_COOKIE)?.value === "1") {
    const { error: legalError } = await supabase.auth.updateUser({
      data: legalAcceptanceMetadata(),
    });
    if (!legalError) accepted = true;
  }

  jar.set(LEGAL_ACCEPT_COOKIE, "", { path: "/", maxAge: 0 });

  if (user && !accepted) {
    const membership = await getPrimaryMembership();
    if (!membership) {
      const locale = localeFromPath(nextPath);
      redirect(
        `/${locale}/legal/accept?next=${encodeURIComponent(nextPath)}`,
      );
    }
  }

  await acceptPendingInvitationsForUser();
  const membership = await getPrimaryMembership();
  const dest = membership
    ? replacePathLocale(nextPath, membership.organization.defaultLocale)
    : nextPath;
  redirect(dest);
}
