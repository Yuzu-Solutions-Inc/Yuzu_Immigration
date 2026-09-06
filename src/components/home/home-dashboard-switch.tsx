import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export async function HomeDashboardSwitch({
  active,
}: {
  active: "finance" | "immigration";
}) {
  const t = await getTranslations("appHome");
  const itemClass = (on: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
      on
        ? "bg-action text-action-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="mb-4 flex w-fit rounded-xl border border-border bg-surface p-1">
      <Link href="/home?view=finance" className={itemClass(active === "finance")}>
        {t("dashboardFinance")}
      </Link>
      <Link
        href="/home?view=immigration"
        className={itemClass(active === "immigration")}
      >
        {t("dashboardImmigration")}
      </Link>
    </div>
  );
}
