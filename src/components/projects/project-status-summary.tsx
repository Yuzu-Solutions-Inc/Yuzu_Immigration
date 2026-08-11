import { getTranslations } from "next-intl/server";

import type { ProjectStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

export function formatStatusDate(isoDate: string, locale: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

export async function ProjectStatusSummary({
  status,
  statusAt,
  locale,
  className,
}: {
  status: ProjectStatus;
  statusAt: string;
  locale: string;
  className?: string;
}) {
  const t = await getTranslations("projects");

  return (
    <span
      className={cn(
        "inline-flex flex-col items-start gap-0.5 text-xs sm:items-end",
        className,
      )}
    >
      <span className="font-semibold tracking-wide text-brand uppercase">
        {t(`statuses.${status}`)}
      </span>
      <span className="font-normal tracking-normal text-muted-foreground normal-case">
        {formatStatusDate(statusAt, locale)}
      </span>
    </span>
  );
}
