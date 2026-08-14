"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  setProjectAssistantAccessAction,
  type TeamActionState,
} from "@/app/actions/team";
import { Button } from "@/components/ui/button";

const initial: TeamActionState = {};

type AssistantOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

export function ProjectAssistantShare({
  locale,
  projectId,
  assistants,
  selectedUserIds,
}: {
  locale: string;
  projectId: string;
  assistants: AssistantOption[];
  selectedUserIds: string[];
}) {
  const t = useTranslations("projects");
  const [state, action, pending] = useActionState(
    setProjectAssistantAccessAction,
    initial,
  );
  const selected = new Set(selectedUserIds);

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      forbidden: t("errors.forbidden"),
      not_found: t("errors.notFound"),
      save_failed: t("errors.updateFailed"),
    }[state.error] ??
      t("errors.generic"));

  if (assistants.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold text-brand">
        {t("shareWithAssistants")}
      </h2>

      <form action={action} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="projectId" value={projectId} />
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {assistants.map((assistant) => {
            const label =
              assistant.full_name || assistant.email || assistant.user_id;
            return (
              <li key={assistant.user_id} className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  name="userId"
                  value={assistant.user_id}
                  defaultChecked={selected.has(assistant.user_id)}
                  className="size-4 rounded border-input"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand">{label}</p>
                  {assistant.email && assistant.full_name ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {assistant.email}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {state.message === "shared" ? (
          <p className="text-sm text-success" role="status">
            {t("shareSaved")}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("saving") : t("shareSave")}
        </Button>
      </form>
    </section>
  );
}
