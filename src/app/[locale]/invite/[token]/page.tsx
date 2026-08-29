import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { SurfaceCard } from "@/components/layout/surface-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  acceptInvitationByToken,
  getInvitationByToken,
} from "@/lib/auth/invitations";
import { getSessionUser } from "@/lib/auth/session";
import { hasAcceptedLegal } from "@/lib/legal/acceptance";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("invite");
  const tRoles = await getTranslations("orgRoles");
  const invitation = await getInvitationByToken(token);
  const user = await getSessionUser();
  const nextPath = `/${locale}/invite/${token}`;

  if (!invitation) {
    return (
      <InviteShell>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("invalidTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("invalid")}</p>
      </InviteShell>
    );
  }

  const expired =
    Boolean(invitation.revoked_at) ||
    new Date(invitation.expires_at).getTime() <= Date.now();
  const alreadyAccepted = Boolean(invitation.accepted_at);
  const orgName = invitation.organizationName ?? t("organizationFallback");
  const roleLabel = tRoles(invitation.role);

  if (user) {
    if (!hasAcceptedLegal(user)) {
      redirect(
        `/${locale}/legal/accept?next=${encodeURIComponent(nextPath)}`,
      );
    }

    const result = await acceptInvitationByToken(token);
    if (result.ok || result.error === "already_accepted") {
      redirect(`/${locale}/welcome`);
    }

    const errorMessage =
      {
        expired: t("expired"),
        email_mismatch: t("emailMismatch", { email: invitation.email }),
        join_failed: t("joinFailed"),
        seats_exceeded: t("seatsExceeded"),
        invalid: t("invalid"),
        unauthorized: t("invalid"),
        legal_required: t("joinFailed"),
      }[result.error] ?? t("joinFailed");

    return (
      <InviteShell>
        <BrandLogo size="sm" href={null} />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title", { org: orgName })}
        </h1>
        <p className="text-[15px] text-muted-foreground">{errorMessage}</p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <BrandLogo size="sm" href={null} />
      <h1 className="font-heading text-2xl font-semibold text-brand">
        {t("title", { org: orgName })}
      </h1>
      <p className="text-[15px] text-muted-foreground">
        {alreadyAccepted
          ? t("alreadyAccepted")
          : expired
            ? t("expired")
            : t("subtitle", { role: roleLabel, email: invitation.email })}
      </p>
      {!alreadyAccepted && !expired ? (
        <a
          href={`/${locale}/login?next=${encodeURIComponent(nextPath)}`}
          className={cn(
            buttonVariants({ size: "lg" }),
            "bg-action text-action-foreground hover:bg-action/90",
          )}
        >
          {t("signIn")}
        </a>
      ) : (
        <Link href="/login" className="text-sm font-medium text-action hover:underline">
          {t("goLogin")}
        </Link>
      )}
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <SurfaceCard className="space-y-4">{children}</SurfaceCard>
      <div className="flex justify-center sm:justify-start">
        <LegalLinks />
      </div>
    </main>
  );
}
