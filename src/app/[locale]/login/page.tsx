import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LoginForm } from "@/components/auth/login-form";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { SurfaceCard } from "@/components/layout/surface-card";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const { locale } = await params;
  const { next, mode } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const initialMode = mode === "signup" ? "signup" : "signin";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <div className="space-y-3 text-center sm:text-left">
        <BrandLogo size="sm" />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SurfaceCard>
        <LoginForm
          locale={locale as "en" | "fr" | "es"}
          nextPath={next}
          initialMode={initialMode}
        />
      </SurfaceCard>

      <div className="flex justify-center sm:justify-start">
        <PrivacyLink />
      </div>
    </main>
  );
}
