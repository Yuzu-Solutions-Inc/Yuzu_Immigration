"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addCustomDocumentRequestAction,
  downloadAllProjectDocumentsAction,
  downloadProjectDocumentAction,
  removeDocumentRequestAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
import { DocumentFileActions } from "@/components/documents/document-file-actions";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import {
  StatusPill,
  type StatusPillTone,
} from "@/components/ui/status-pill";
import { triggerBrowserDownload } from "@/lib/documents/browser-file";
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

function documentPill(
  row: DocumentRequestWithFile,
  t: ReturnType<typeof useTranslations<"documents">>,
): { label: string; tone: StatusPillTone } {
  if (row.status === "accepted") {
    return { label: t("pills.completed"), tone: "success" };
  }
  if (row.status === "uploaded") {
    return { label: t("pills.submitted"), tone: "action" };
  }
  if (row.status === "rejected") {
    return { label: t("pills.denied"), tone: "destructive" };
  }
  return { label: t("pills.waiting"), tone: "warning" };
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
  const [addState, addAction, addPending] = useActionState(
    addCustomDocumentRequestAction,
    initial,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeDocumentRequestAction,
    initial,
  );
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [downloadingAll, startDownloadAll] = useTransition();
  const [downloadAllError, setDownloadAllError] = useState<string | null>(null);

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
  const uploadedCount = ordered.filter((row) => row.file).length;

  function handleDownloadAll() {
    setDownloadAllError(null);
    startDownloadAll(async () => {
      const result = await downloadAllProjectDocumentsAction(projectId);
      if (!result.ok) {
        setDownloadAllError(result.error);
        return;
      }
      triggerBrowserDownload(result);
    });
  }

  return (
    <SurfaceCard className="space-y-0 overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("title")}
        </h2>
        {uploadedCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadingAll}
            onClick={handleDownloadAll}
          >
            {downloadingAll ? t("downloading") : t("downloadAll")}
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-border border-t border-border">
        {ordered.length === 0 ? (
          <li className="px-5 py-3 text-sm text-muted-foreground">
            {t("emptyPerson")}
          </li>
        ) : (
          ordered.map((row) => {
            const person = peopleById.get(row.person_id);
            const pill = documentPill(row, t);
            const title = [
              documentLabel(row, t),
              row.request_scope === "project"
                ? t("scopeProject")
                : showPerson && person
                  ? person.displayName
                  : null,
              row.consultant_note,
            ]
              .filter(Boolean)
              .join(" · ");
            const canReview = row.status === "uploaded" && Boolean(row.file);

            return (
              <li key={row.id} className="group space-y-2 px-5 py-3">
                <div className="flex items-center gap-2">
                  <p
                    className="min-w-0 flex-1 truncate text-sm font-medium text-brand"
                    title={title}
                  >
                    {documentLabel(row, t)}
                    {row.request_scope === "project" ? (
                      <span className="font-normal text-muted-foreground">
                        {` · ${t("scopeProject")}`}
                      </span>
                    ) : showPerson && person ? (
                      <span className="font-normal text-muted-foreground">
                        {` · ${person.displayName}`}
                      </span>
                    ) : null}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:has-[p[role=alert]]:opacity-100">
                    {row.file ? (
                      <DocumentFileActions
                        compact
                        requestId={row.id}
                        filename={row.file.original_filename}
                        fetchFile={downloadProjectDocumentAction}
                        review={
                          canReview
                            ? { projectId, locale, canReview: true }
                            : undefined
                        }
                      />
                    ) : null}
                    <form
                      action={removeAction}
                      className="flex shrink-0"
                      onSubmit={(event) => {
                        if (
                          !window.confirm(
                            t("removeConfirm", {
                              name: documentLabel(row, t),
                            }),
                          )
                        ) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="requestId" value={row.id} />
                      <input
                        type="hidden"
                        name="projectId"
                        value={projectId}
                      />
                      <input type="hidden" name="locale" value={locale} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-xs"
                        disabled={removePending}
                        aria-label={t("remove")}
                        title={t("remove")}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </div>
                  <StatusPill label={pill.label} tone={pill.tone} />
                </div>
                {row.status === "rejected" && row.rejection_comment ? (
                  <p className="text-sm text-destructive">
                    {t("review.rejectionNote", {
                      comment: row.rejection_comment,
                    })}
                  </p>
                ) : null}
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
          {downloadAllError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {downloadAllError === "no_files"
                ? t("errors.noFiles")
                : t("errors.downloadFailed")}
            </p>
          ) : null}
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
            <p className="mt-2 text-sm text-success">{t("added")}</p>
          ) : null}
        </li>
      </ul>
    </SurfaceCard>
  );
}
