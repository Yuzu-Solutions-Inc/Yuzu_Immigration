"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  downloadShareDocumentAction,
  uploadShareDocumentAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
import {
  downloadPortalDocumentAction,
  uploadPortalDocumentAction,
} from "@/app/actions/portal-workspace";
import { DocumentFileActions } from "@/components/documents/document-file-actions";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/field";
import {
  StatusPill,
  type StatusPillTone,
} from "@/components/ui/status-pill";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_BYTES,
} from "@/lib/documents/catalog";
import type { DocumentRequestWithFile } from "@/lib/documents/service";
import { cn } from "@/lib/utils";

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

export function ClientDocumentsUpload({
  token,
  projectId,
  people,
  requests,
}: {
  token?: string;
  projectId?: string;
  people: Array<{ id: string; displayName: string; role: string }>;
  requests: DocumentRequestWithFile[];
}) {
  const t = useTranslations("documents");
  const tf = useTranslations("forms");
  const [state, action, pending] = useActionState(
    projectId ? uploadPortalDocumentAction : uploadShareDocumentAction,
    initial,
  );
  const [localRequests, setLocalRequests] = useState(requests);
  const [selectedFiles, setSelectedFiles] = useState<
    Record<string, File | null>
  >({});
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [successRequestId, setSuccessRequestId] = useState<string | null>(null);
  const pendingUploadRef = useRef<{ requestId: string; file: File } | null>(
    null,
  );

  const accept = DOCUMENT_ALLOWED_MIME_TYPES.join(",");
  const maxMb = Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024));

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );
  const showPerson = people.length > 1;

  const ordered = useMemo(() => {
    const index = new Map(people.map((person, i) => [person.id, i]));
    return [...localRequests].sort((a, b) => {
      const ai = index.get(a.person_id) ?? 999;
      const bi = index.get(b.person_id) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.sort_order - b.sort_order;
    });
  }, [people, localRequests]);

  useEffect(() => {
    const pendingUpload = pendingUploadRef.current;
    if (!pendingUpload) return;

    if (state.message === "uploaded") {
      const { requestId, file } = pendingUpload;
      pendingUploadRef.current = null;
      setLocalRequests((prev) =>
        prev.map((row) =>
          row.id === requestId
            ? {
                ...row,
                status: "uploaded",
                file: {
                  id: row.file?.id ?? requestId,
                  organization_id: row.organization_id,
                  project_id: row.project_id,
                  request_id: row.id,
                  person_id: row.person_id,
                  storage_path: "",
                  original_filename: file.name,
                  content_type: file.type,
                  byte_size: file.size,
                  encryption_alg: "aes-256-gcm",
                  uploaded_via: "share_link",
                  created_at: new Date().toISOString(),
                },
              }
            : row,
        ),
      );
      setSelectedFiles((prev) => ({ ...prev, [requestId]: null }));
      setSuccessRequestId(requestId);
      setActiveRequestId(null);
      return;
    }

    if (state.error) {
      pendingUploadRef.current = null;
      setActiveRequestId(null);
    }
  }, [state]);

  function onFileChange(requestId: string, fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    setSelectedFiles((prev) => ({ ...prev, [requestId]: file }));
    if (successRequestId === requestId) setSuccessRequestId(null);
  }

  function clearSelection(requestId: string) {
    setSelectedFiles((prev) => ({ ...prev, [requestId]: null }));
  }

  function onSubmit(requestId: string, formData: FormData) {
    const selected = selectedFiles[requestId];
    if (!selected) return;
    pendingUploadRef.current = { requestId, file: selected };
    setActiveRequestId(requestId);
    setSuccessRequestId(null);
    if (projectId) formData.set("projectId", projectId);
    if (token) formData.set("token", token);
    formData.set("requestId", requestId);
    formData.set("file", selected);
    action(formData);
  }

  function fetchFile(requestId: string) {
    return projectId
      ? downloadPortalDocumentAction(projectId, requestId)
      : downloadShareDocumentAction(token ?? "", requestId);
  }

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      expired: t("errors.expired"),
      auth_required: tf("shareAuth.errors.authRequired"),
      file_too_large: t("errors.fileTooLarge", { maxMb }),
      file_type: t("errors.fileType"),
      upload_failed: t("errors.uploadFailed"),
      server_config: t("errors.serverConfig"),
      locked: t("errors.locked"),
      granted: t("errors.granted"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <SurfaceCard className="space-y-0 overflow-hidden p-0 sm:p-0">
      <div className="space-y-1 px-5 py-4">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("title")}
        </h2>
        <FieldHint>{t("clientFormats", { maxMb })}</FieldHint>
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
            const selected = selectedFiles[row.id] ?? null;
            const isUploading = pending && activeRequestId === row.id;
            const justUploaded = successRequestId === row.id;
            const hasUploaded = Boolean(row.file);
            const isApproved = row.status === "accepted";
            const canModify = !isApproved;
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {row.file ? (
                      <div className="flex items-center opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:has-[p[role=alert]]:opacity-100">
                        <DocumentFileActions
                          compact
                          requestId={row.id}
                          filename={row.file.original_filename}
                          fetchFile={fetchFile}
                        />
                      </div>
                    ) : null}
                    {canModify ? (
                      <form
                        action={(fd) => onSubmit(row.id, fd)}
                        className="flex shrink-0 items-center gap-1.5"
                      >
                        <label
                          className={cn(
                            buttonVariants({ variant: "outline", size: "xs" }),
                            "cursor-pointer",
                          )}
                        >
                          {t("chooseFile")}
                          <input
                            type="file"
                            accept={accept}
                            className="sr-only"
                            onChange={(e) => {
                              onFileChange(row.id, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {selected ? (
                          <>
                            <span
                              className="hidden max-w-[9rem] truncate text-xs text-muted-foreground sm:inline"
                              title={selected.name}
                            >
                              {selected.name}
                            </span>
                            <Button type="submit" size="xs" disabled={isUploading}>
                              {isUploading
                                ? t("uploading")
                                : hasUploaded
                                  ? t("replace")
                                  : t("upload")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              disabled={isUploading}
                              onClick={() => clearSelection(row.id)}
                            >
                              {t("clearSelection")}
                            </Button>
                          </>
                        ) : null}
                      </form>
                    ) : null}
                  </div>
                  <StatusPill
                    label={
                      justUploaded ? t("justUploaded") : pill.label
                    }
                    tone={justUploaded ? "success" : pill.tone}
                  />
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
      </ul>

      {error ? (
        <p className="border-t border-border px-5 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </SurfaceCard>
  );
}
