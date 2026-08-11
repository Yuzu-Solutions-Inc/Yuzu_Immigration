import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("legal");

  return (
    <footer className="mt-auto w-full border-t border-border/80 bg-background px-6 py-5">
      <p className="mx-auto max-w-3xl text-center text-[12px] leading-relaxed text-[#4A5568]">
        {t("disclaimer")}
      </p>
    </footer>
  );
}
