import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { SurfaceCard } from "@/components/layout/surface-card";
import { buttonVariants } from "@/components/ui/button";
import {
  getPrimaryMembership,
  getSessionUser,
} from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }

  const t = await getTranslations("appHome");
  const auth = await getTranslations("auth");
  const app = await getTranslations("app");

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-brand px-5 py-4 text-white shadow-elevated">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.14em] text-white/70 uppercase">
            {app("name")}
          </p>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {displayName
              ? t("welcome", { name: displayName })
              : t("welcomeFallback")}
          </h1>
          <p className="text-sm text-white/75">
            {t("orgLabel")}:{" "}
            <span className="font-medium text-white">
              {membership.organization.name}
            </span>
            <span className="mx-2 text-white/35">·</span>
            {t("roleLabel")}: {membership.role}
          </p>
        </div>

        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white",
            )}
          >
            {auth("signOut")}
          </button>
        </form>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <SurfaceCard className="space-y-2">
          <div className="inline-flex rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            {t("customers")}
          </div>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("customers")}
          </h2>
          <p className="text-[15px] text-muted-foreground text-pretty">
            {t("customersHint")}
          </p>
        </SurfaceCard>
        <SurfaceCard className="space-y-2">
          <div className="inline-flex rounded-full bg-highlight/15 px-2.5 py-1 text-xs font-semibold text-[#b45309]">
            {t("team")}
          </div>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("team")}
          </h2>
          <p className="text-[15px] text-muted-foreground text-pretty">
            {t("teamHint")}
          </p>
        </SurfaceCard>
      </section>
    </main>
  );
}
