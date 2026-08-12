"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addCustomDocumentRequestAction,
  downloadProjectDocumentAction,
  removeCustomDocumentRequestAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import type { DocumentRequestWithFile } from "@/lib/documents/service";

const initial: DocumentsActionState = {};

function triggerBrowserDownload(
  base64: string,
  filename: string,
  contentType: string,
) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [personId, setPersonId] = useState(people[0]?.id ?? "");

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentRequestWithFile[]>();
    for (const person of people) map.set(person.id, []);
    for (const row of requests) {
      const list = map.get(row.person_id) ?? [];
      list.push(row);
      map.set(row.person_id, list);
    }
    return map;
  }, [people, requests]);

  function handleDownload(requestId: string) {
    setDownloadError(null);
    setDownloadingId(requestId);
    startTransition(async () => {
      try {
        const result = await downloadProjectDocumentAction(requestId);
        if (!result.ok) {
          setDownloadError(result.error);
          return;
        }
        triggerBrowserDownload(
          result.base64,
          result.filename,
          result.contentType,
        );
      } finally {
        setDownloadingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("help")}</p>
      </div>

      <ul className="space-y-4">
        {people.map((person) => {
          const rows = grouped.get(person.id) ?? [];
          return (
            <li key={person.id}>
              <SurfaceCard className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-heading text-base font-semibold text-brand">
                    {person.displayName}
                  </h3>
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {tr(person.role as never)}
                  </span>
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {rows.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-muted-foreground">
                      {t("emptyPerson")}
                    </li>
                  ) : (
                    rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
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
                            {t(`statuses.${row.status}`)}
                            {row.file
                              ? ` · ${row.file.original_filename}`
                              : ""}
                          </p>
                          {row.consultant_note ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.consultant_note}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {row.file ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              disabled={pending}
                              onClick={() => handleDownload(row.id)}
                              aria-label={t("download")}
                            >
                              {downloadingId === row.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Download className="size-4" />
                              )}
                            </Button>
                          ) : null}
                          {row.doc_key === "custom" ? (
                            <form action={removeAction}>
                              <input
                                type="hidden"
                                name="requestId"
                                value={row.id}
                              />
                              <input
                                type="hidden"
                                name="projectId"
                                value={projectId}
                              />
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
                    ))
                  )}
                </ul>
              </SurfaceCard>
            </li>
          );
        })}
      </ul>

      {downloadError ? (
        <p className="text-sm text-destructive" role="alert">
          {t("errors.downloadFailed")}
        </p>
      ) : null}
      {removeState.error ? (
        <p className="text-sm text-destructive" role="alert">
          {t("errors.removeFailed")}
        </p>
      ) : null}

      <SurfaceCard className="space-y-3">
        <div>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("addTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("addHelp")}</p>
        </div>
        <form action={addAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="locale" value={locale} />
          <div className="min-w-[160px] space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase">
              {t("assignPerson")}
            </label>
            <select
              name="personId"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase">
              {t("label")}
            </label>
            <input
              name="label"
              required
              maxLength={120}
              placeholder={t("labelPlaceholder")}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
            />
          </div>
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase">
              {t("note")}
            </label>
            <input
              name="consultantNote"
              maxLength={240}
              placeholder={t("notePlaceholder")}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
            />
          </div>
          <Button type="submit" disabled={addPending || !personId}>
            {addPending ? t("adding") : t("add")}
          </Button>
        </form>
        {addState.error ? (
          <p className="text-sm text-destructive">{t("errors.addFailed")}</p>
        ) : null}
        {addState.message === "added" ? (
          <p className="text-sm text-emerald-700">{t("added")}</p>
        ) : null}
      </SurfaceCard>
    </div>
  );
}
