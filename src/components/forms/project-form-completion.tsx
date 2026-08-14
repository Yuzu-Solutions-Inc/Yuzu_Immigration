"use client";

import { useTranslations } from "next-intl";

import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import { ProgressMeter } from "@/components/home/progress-meter";
import { SurfaceCard } from "@/components/layout/surface-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { questionnaireFillPercent } from "@/lib/ircc/form-readiness";
import { cn } from "@/lib/utils";

export function ProjectFormCompletion({
  projectId,
  people,
}: {
  projectId: string;
  people: QuestionnairePerson[];
}) {
  const t = useTranslations("forms");
  const tr = useTranslations("roles");

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("completionTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("completionHelp")}</p>
        </div>
        <Link
          href={`/projects/${projectId}/forms`}
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-action text-white hover:bg-action/90",
          )}
        >
          {t("openQuestionnaire")}
        </Link>
      </div>

      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("questionnaireEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {people.map((person) => {
            const percent = questionnaireFillPercent(
              person.formCodes,
              person.answers,
            );
            return (
              <li
                key={person.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand">
                    {person.displayName}
                  </p>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {tr(person.role)}
                  </p>
                </div>
                <ProgressMeter
                  className="shrink-0"
                  valueLabel={t("progressComplete", { percent })}
                  percent={percent}
                />
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}
