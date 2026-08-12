"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  uploadShareDocumentAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
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
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const accept = DOCUMENT_ALLOWED_MIME_TYPES.join(",");
  const maxMb = Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024));

  function onSubmit(requestId: string, formData: FormData) {
    setActiveRequestId(requestId);
    formData.set("token", token);
    formData.set("requestId", requestId);
    action(formData);
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
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
    }
  }

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      expired: t("errors.expired"),
      file_too_large: t("errors.fileTooLarge", { maxMb }),
      file_type: t("errors.fileType"),
      upload_failed: t("errors.uploadFailed"),
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
              {rows.map((row) => (
                <li key={row.id} className="space-y-3 px-4 py-4">
                  <div>
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
                      {row.file ? ` · ${row.file.original_filename}` : ""}
                    </p>
                    {row.consultant_note ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.consultant_note}
                      </p>
                    ) : null}
                  </div>
                  <form
                    action={(fd) => onSubmit(row.id, fd)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="file"
                      name="file"
                      accept={accept}
                      required
                      className="block w-full max-w-md text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-action file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                    />
                    <Button
                      type="submit"
                      disabled={pending && activeRequestId === row.id}
                    >
                      {pending && activeRequestId === row.id
                        ? t("uploading")
                        : row.file
                          ? t("replace")
                          : t("upload")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {state.message === "uploaded" ? (
        <p className="text-sm text-emerald-700">{t("uploaded")}</p>
      ) : null}
    </div>
  );
}
