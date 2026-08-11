import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const nav = await getTranslations("nav");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("welcome")}</p>
        </div>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <span className="text-foreground">{nav("dashboard")}</span>
          <span>{nav("clients")}</span>
          <span>{nav("cases")}</span>
          <span>{nav("documents")}</span>
        </nav>
      </header>

      <section className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <p>{t("empty")}</p>
        <p className="mt-4 text-sm">
          <Link href="/" className="underline underline-offset-4">
            ← Home
          </Link>
        </p>
      </section>
    </div>
  );
}
