import { getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const app = await getTranslations("app");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {app("name")}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
          {t("subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className={cn(buttonVariants())}>
          {t("cta")}
        </Link>
        <p className="text-sm text-muted-foreground">{t("setup")}</p>
      </div>
    </main>
  );
}
