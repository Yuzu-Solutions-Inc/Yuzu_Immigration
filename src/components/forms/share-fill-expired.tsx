import { getTranslations } from "next-intl/server";

export async function ShareFillExpired() {
  const t = await getTranslations("forms");
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-heading text-2xl font-semibold text-brand">
        {t("linkExpiredTitle")}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {t("linkExpiredBody")}
      </p>
    </div>
  );
}
