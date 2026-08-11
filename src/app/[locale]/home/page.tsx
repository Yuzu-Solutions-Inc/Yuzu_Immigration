import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
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
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-[0.08em] uppercase">
            {app("name")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {displayName
              ? t("welcome", { name: displayName })
              : t("welcomeFallback")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("orgLabel")}:{" "}
            <span className="font-medium text-foreground">
              {membership.organization.name}
            </span>
            <span className="mx-2 text-border">·</span>
            {t("roleLabel")}: {membership.role}
          </p>
        </div>

        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {auth("signOut")}
          </button>
        </form>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2 border-t pt-5">
          <h2 className="text-lg font-medium">{t("customers")}</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            {t("customersHint")}
          </p>
        </div>
        <div className="space-y-2 border-t pt-5">
          <h2 className="text-lg font-medium">{t("team")}</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            {t("teamHint")}
          </p>
        </div>
      </section>
    </main>
  );
}
