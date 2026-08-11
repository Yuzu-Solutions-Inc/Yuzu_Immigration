import { getTranslations, setRequestLocale } from "next-intl/server";

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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.95_0.03_230),_transparent_55%),linear-gradient(to_bottom,_oklch(0.985_0.01_95),_oklch(0.97_0.02_220))]"
      />
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <p className="text-sm font-semibold tracking-[0.08em] text-foreground uppercase">
          {app("name")}
        </p>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("cta")}
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-6 pb-20 pt-10">
        <div className="max-w-3xl space-y-5">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {app("name")}
          </h1>
          <p className="max-w-2xl text-xl text-muted-foreground text-pretty sm:text-2xl">
            {t("title")}
          </p>
          <p className="max-w-xl text-base text-muted-foreground text-pretty">
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
