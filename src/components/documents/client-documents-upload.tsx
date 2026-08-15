"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  downloadShareDocumentAction,
  uploadShareDocumentAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
import { DocumentFileActions } from "@/components/documents/document-file-actions";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_BYTES,
} from "@/lib/documents/catalog";
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClientDocumentsUpload({
  token,
  people,
  requests,
}: {
  token: string;
  people: Array<{ id: string; displayName: string; role: string }>;
  requests: DocumentRequestWithFile[];
}) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    uploadShareDocumentAction,
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
    formData.set("token", token);
    formData.set("requestId", requestId);
    formData.set("file", selected);
    action(formData);
  }

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      expired: t("errors.expired"),
      file_too_large: t("errors.fileTooLarge", { maxMb }),
      file_type: t("errors.fileType"),
      upload_failed: t("errors.uploadFailed"),
      server_config: t("errors.serverConfig"),
      locked: t("errors.locked"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("clientFormats", { maxMb })}
      </p>

      {people.map((person) => {
        const rows = localRequests.filter((r) => r.person_id === person.id);
        if (rows.length === 0) return null;
        return (
          <section key={person.id} className="space-y-3">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {person.displayName}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
              {rows.map((row) => {
                const selected = selectedFiles[row.id] ?? null;
                const isUploading = pending && activeRequestId === row.id;
                const justUploaded = successRequestId === row.id;
                const hasUploaded = Boolean(row.file);
                const isRejected = row.status === "rejected";
                const isApproved = row.status === "accepted";
                const canModify = !isApproved;

                return (
                  <li key={row.id} className="space-y-3 px-4 py-4">
                    <div className="space-y-1.5">
                      <p className="font-medium text-brand">
                        {documentLabel(row, t)}
                        {row.is_required ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            · {t("required")}
                          </span>
                        ) : null}
                      </p>
                      {row.consultant_note ? (
                        <p className="text-sm text-muted-foreground">
                          {row.consultant_note}
                        </p>
                      ) : null}

                      {isRejected && row.rejection_comment ? (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          <span className="font-semibold">
                            {t("review.clientDenied")}
                          </span>
                          {": "}
                          {row.rejection_comment}
                        </p>
                      ) : null}

                      {hasUploaded ? (
                        <div className="space-y-2">
                          <p className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
                            <span className="font-semibold">
                              {isApproved
                                ? t("statusApproved")
                                : t("statusUploaded")}
                            </span>
                            {": "}
                            {row.file!.original_filename}
                            <span className="text-success/80">
                              {" "}
                              · {formatBytes(row.file!.byte_size)}
                            </span>
                            {justUploaded ? (
                              <span className="ml-2 font-medium">
                                {t("justUploaded")}
                              </span>
                            ) : null}
                          </p>
                          <DocumentFileActions
                            requestId={row.id}
                            filename={row.file!.original_filename}
                            fetchFile={(id) =>
                              downloadShareDocumentAction(token, id)
                            }
                          />
                        </div>
                      ) : (
                        <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text">
                          <span className="font-semibold">
                            {t("statusMissing")}
                          </span>
                        </p>
                      )}

                      {selected ? (
                        <p className="rounded-lg border border-dashed border-action/40 bg-action/5 px-3 py-2 text-sm text-brand">
                          <span className="font-semibold text-action">
                            {t("statusSelected")}
                          </span>
                          {": "}
                          {selected.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {formatBytes(selected.size)}
                          </span>
                        </p>
                      ) : null}
                    </div>

                    {canModify ? (
                      <form
                        action={(fd) => onSubmit(row.id, fd)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <label className="inline-flex cursor-pointer items-center rounded-lg bg-muted px-3 py-2 text-sm font-medium text-brand hover:bg-muted/80">
                          {hasUploaded ? t("chooseReplacement") : t("chooseFile")}
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
                            <Button type="submit" disabled={isUploading}>
                              {isUploading
                                ? t("uploading")
                                : hasUploaded
                                  ? t("replace")
                                  : t("upload")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isUploading}
                              onClick={() => clearSelection(row.id)}
                            >
                              {t("clearSelection")}
                            </Button>
                          </>
                        ) : null}
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
