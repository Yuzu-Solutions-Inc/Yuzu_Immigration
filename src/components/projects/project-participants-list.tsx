"use client";

import { useTranslations } from "next-intl";

import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import { ProgressMeter } from "@/components/home/progress-meter";
import { Link } from "@/i18n/navigation";
import { questionnaireFillPercent } from "@/lib/ircc/form-readiness";

export function ProjectParticipantsList({
  projectId,
  people,
  participants,
}: {
  projectId: string;
  people: QuestionnairePerson[];
  participants: Array<{
    id: string;
    role: string;
    person?: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
    } | null;
  }>;
}) {
  const t = useTranslations("projects");
  const tr = useTranslations("roles");
  const tf = useTranslations("forms");
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("participants")}
        </h2>
        <Link
          href={`/projects/${projectId}/edit`}
          className="text-sm font-medium text-action hover:underline"
        >
          {t("editPeople")}
        </Link>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
        {participants.map((row) => {
          const questionnaire = row.person
            ? byId.get(row.person.id)
            : undefined;
          const percent = questionnaire
            ? questionnaireFillPercent(
                questionnaire.formCodes,
                questionnaire.answers,
              )
            : null;

          return (
            <li key={row.id}>
              {row.person ? (
                <Link
                  href={`/people/${row.person.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-brand">
                      {row.person.first_name} {row.person.last_name}
                    </p>
                    {row.person.email ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {row.person.email}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    {percent !== null ? (
                      <ProgressMeter
                        className="w-16"
                        valueLabel={t("formsProgress", { percent })}
                        percent={percent}
                      />
                    ) : null}
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {tr(row.role)}
                    </span>
                  </div>
                </Link>
              ) : (
                <div className="px-5 py-4 text-sm text-muted-foreground">
                  {tr(row.role)}
                </div>
              )}
            </li>
          );
        })}
        {participants.length === 0 ? (
          <li className="px-5 py-4 text-sm text-muted-foreground">
            {tf("questionnaireEmpty")}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
