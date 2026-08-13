"use client";

import { useActionState, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addCustomDocumentRequestAction,
  downloadProjectDocumentAction,
  removeCustomDocumentRequestAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
import { DocumentFileActions } from "@/components/documents/document-file-actions";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import type { DocumentRequestWithFile } from "@/lib/documents/service";

const initial: DocumentsActionState = {};

function documentLabel(
  row: DocumentRequestWithFile,
  t: ReturnType<typeof useTranslations<"documents">>,
) {
  if (row.doc_key === "custom") {
    return row.custom_label ?? t("customFallback");
  }
  return t(`keys.${row.doc_key}`);
}

export function ProjectDocumentsPanel({
  locale,
  projectId,
  requests,
  people,
}: {
  locale: string;
  projectId: string;
  requests: DocumentRequestWithFile[];
  people: Array<{ id: string; displayName: string; role: string }>;
}) {
  const t = useTranslations("documents");
  const tr = useTranslations("roles");
  const [addState, addAction, addPending] = useActionState(
    addCustomDocumentRequestAction,
    initial,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeCustomDocumentRequestAction,
    initial,
  );
  const [personId, setPersonId] = useState(people[0]?.id ?? "");

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const ordered = useMemo(() => {
    const index = new Map(people.map((person, i) => [person.id, i]));
    return [...requests].sort((a, b) => {
      const ai = index.get(a.person_id) ?? 999;
      const bi = index.get(b.person_id) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.sort_order - b.sort_order;
    });
  }, [people, requests]);

  const showPerson = people.length > 1;

  return (
    <SurfaceCard className="space-y-0 overflow-hidden p-0 sm:p-0">
      <h2 className="font-heading px-5 py-4 text-lg font-semibold text-brand">
        {t("title")}
      </h2>

      <ul className="divide-y divide-border border-t border-border">
        {ordered.length === 0 ? (
          <li className="px-5 py-3 text-sm text-muted-foreground">
            {t("emptyPerson")}
          </li>
        ) : (
          ordered.map((row) => {
            const person = peopleById.get(row.person_id);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-brand">
                    {documentLabel(row, t)}
                    {row.is_required ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        · {t("required")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {showPerson && person
                      ? `${person.displayName} · ${tr(person.role as never)} · `
                      : ""}
                    {t(`statuses.${row.status}`)}
                    {row.file ? ` · ${row.file.original_filename}` : ""}
                  </p>
                  {row.consultant_note ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.consultant_note}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {row.file ? (
                    <DocumentFileActions
                      compact
                      requestId={row.id}
                      filename={row.file.original_filename}
                      fetchFile={downloadProjectDocumentAction}
                    />
                  ) : null}
                  {row.doc_key === "custom" ? (
                    <form action={removeAction}>
                      <input type="hidden" name="requestId" value={row.id} />
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="locale" value={locale} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="icon-sm"
                        disabled={removePending}
                        aria-label={t("remove")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })
        )}

        <li className="px-5 py-3">
          <form action={addAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="locale" value={locale} />
            {showPerson ? (
              <select
                name="personId"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                aria-label={t("assignPerson")}
                className="h-10 min-w-[140px] rounded-xl border border-input bg-surface px-3 text-sm"
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="personId" value={personId} />
            )}
            <input
              name="label"
              required
              maxLength={120}
              aria-label={t("label")}
              placeholder={t("labelPlaceholder")}
              className="h-10 min-w-[180px] flex-1 rounded-xl border border-input bg-surface px-3 text-sm"
            />
            <input
              name="consultantNote"
              maxLength={240}
              aria-label={t("note")}
              placeholder={t("notePlaceholder")}
              className="h-10 min-w-[160px] flex-1 rounded-xl border border-input bg-surface px-3 text-sm"
            />
            <Button type="submit" disabled={addPending || !personId}>
              {addPending ? t("adding") : t("add")}
            </Button>
          </form>
          {removeState.error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {t("errors.removeFailed")}
            </p>
          ) : null}
          {addState.error ? (
            <p className="mt-2 text-sm text-destructive">
              {t("errors.addFailed")}
            </p>
          ) : null}
          {addState.message === "added" ? (
            <p className="mt-2 text-sm text-emerald-700">{t("added")}</p>
          ) : null}
        </li>
      </ul>
    </SurfaceCard>
  );
}
