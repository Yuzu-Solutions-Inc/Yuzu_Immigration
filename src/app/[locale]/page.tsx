import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default async function MarketingHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const app = await getTranslations("app");

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.12),_transparent_45%),radial-gradient(ellipse_at_bottom_left,_rgba(5,150,105,0.08),_transparent_40%),linear-gradient(180deg,_#f9fafb_0%,_#eef2ff_100%)]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <BrandLogo size="md" />
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("cta")}
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-6 pb-20 pt-8">
        <div className="max-w-3xl space-y-5">
          <p className="text-sm font-semibold tracking-[0.14em] text-action uppercase">
            {app("tagline")}
          </p>
          <BrandLogo size="hero" href={null} />
          <p className="max-w-2xl text-xl text-muted-foreground text-pretty sm:text-2xl">
            {t("title")}
          </p>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            {t("cta")}
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
          >
            {t("secondaryCta")}
          </Link>
        </div>
      </section>
    </main>
  );
}
