import { getTranslations } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import type { StaffSetupChecklist } from "@/lib/crm/setup-checklist";

export async function SetupChecklist({
  setup,
}: {
  setup: StaffSetupChecklist;
}) {
  const hasTasks = setup.items.length > 0 && setup.total > 0;
  if (!hasTasks && !setup.tourPending) {
    return null;
  }

  const t = await getTranslations("appHome.setup");
  const tm = await getTranslations("modules.items");
  const progress =
    setup.total > 0 ? Math.round((setup.done / setup.total) * 100) : 0;
  const tourHref =
    setup.unseenModules.length > 0
      ? `/home?tour=1&modules=${setup.unseenModules.join(",")}`
      : "/home?tour=1";

  return (
    <SurfaceCard className="shrink-0 space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold text-brand">
            {t("title")}
          </h2>
          {setup.total > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("subtitle", { done: setup.done, total: setup.total })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("guidedHelp")}</p>
          )}
        </div>
        {setup.total > 0 ? (
          <div
            className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={setup.total}
            aria-valuenow={setup.done}
            aria-label={t("subtitle", { done: setup.done, total: setup.total })}
          >
            <div
              className="h-full rounded-full bg-action"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </div>
      {setup.tourPending ? (
        <Link
          href={tourHref}
          className="-mx-1 flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm font-semibold text-action transition-colors hover:bg-muted"
        >
          {setup.unseenModules.length > 0 ? t("newModulesCta") : t("guidedCta")}
        </Link>
      ) : null}
      {setup.unseenModules.length > 0 ? (
        <ul className="min-w-0 divide-y divide-border/70">
          {setup.unseenModules.map((id) => (
            <li key={id} className="min-w-0">
              <Link
                href={`/home?tour=1&modules=${id}`}
                className="-mx-1 flex min-w-0 items-center justify-between gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand">
                    {t("newModuleTitle", { module: tm(`${id}.name`) })}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("newModuleHelp")}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-action">
                  {t("tourCta")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {setup.items.length > 0 ? (
        <ul className="min-w-0 divide-y divide-border/70">
          {setup.items.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                className="-mx-1 flex min-w-0 items-center justify-between gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand">
                    {t(`items.${item.id}.title`)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`items.${item.id}.help`)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-action">
                  {t("cta")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </SurfaceCard>
  );
}
