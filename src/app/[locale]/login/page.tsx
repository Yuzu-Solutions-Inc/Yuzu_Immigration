import { getTranslations, setRequestLocale } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const app = await getTranslations("app");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <div className="space-y-2 text-center sm:text-left">
        <Link
          href="/"
          className="font-heading text-sm font-bold tracking-tight text-brand"
        >
          {app("name")}
        </Link>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SurfaceCard>
        <LoginForm locale={locale as "en" | "fr"} nextPath={next} />
      </SurfaceCard>
    </main>
  );
}
