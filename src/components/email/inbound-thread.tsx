"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  assignInboundMessageAction,
  downloadInboundAttachmentAction,
  fileInboundAttachmentAction,
  replyInboundMessageAction,
  type InboundMailActionState,
} from "@/app/actions/inbound-mail";
import { SurfaceCard } from "@/components/layout/surface-card";
import {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { triggerBrowserDownload } from "@/lib/documents/browser-file";
import type { InboundMessageView } from "@/lib/email/inbound-queries";
import { Link } from "@/i18n/navigation";

const emptyState: InboundMailActionState = {};

function actionError(
  error: string | undefined,
  t: ReturnType<typeof useTranslations<"inboundMail">>,
) {
  if (!error) return null;
  const map: Record<string, string> = {
    invalid: t("errors.invalid"),
    unauthorized: t("errors.unauthorized"),
    forbidden: t("errors.forbidden"),
    not_found: t("errors.notFound"),
    unassigned: t("errors.unassigned"),
    not_configured: t("errors.notConfigured"),
    email_failed: t("errors.emailFailed"),
    save_failed: t("errors.saveFailed"),
  };
  return map[error] ?? t("errors.generic");
}

function skipReasonLabel(
  reason: string | null,
  t: ReturnType<typeof useTranslations<"inboundMail">>,
) {
  if (reason === "too_large") return t("skipTooLarge");
  if (reason === "too_many") return t("skipTooMany");
  if (reason === "download_failed") return t("skipDownloadFailed");
  if (reason === "upload_failed") return t("skipUploadFailed");
  return t("skipUnknown");
}

function AttachmentRow({
  locale,
  attachment,
  documentRequests,
  canFile,
}: {
  locale: string;
  attachment: InboundMessageView["attachments"][number];
  documentRequests: { id: string; label: string }[];
  canFile: boolean;
}) {
  const t = useTranslations("inboundMail");
  const [downloadPending, startDownload] = useTransition();
  const [state, formAction, pending] = useActionState(
    fileInboundAttachmentAction,
    emptyState,
  );

  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-brand">
          {attachment.filename}
          <span className="ml-2 text-xs text-muted-foreground">
            {attachment.skipped
              ? t("skipped", {
                  reason: skipReasonLabel(attachment.skip_reason, t),
                })
              : `${Math.max(1, Math.round(attachment.byte_size / 1024))} KB`}
          </span>
        </p>
        {attachment.downloadable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadPending}
            onClick={() => {
              startDownload(async () => {
                const result = await downloadInboundAttachmentAction(
                  attachment.id,
                );
                if (result.ok) triggerBrowserDownload(result);
              });
            }}
          >
            {t("download")}
          </Button>
        ) : null}
      </div>
      {attachment.filed_request_id ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("filed")}</p>
      ) : null}
      {canFile &&
      attachment.downloadable &&
      !attachment.filed_request_id &&
      documentRequests.length > 0 ? (
        <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="attachmentId" value={attachment.id} />
          <Field className="min-w-[12rem] flex-1" density="compact">
            <FieldLabel htmlFor={`file-${attachment.id}`}>
              {t("fileOnProject")}
            </FieldLabel>
            <NativeSelect
              id={`file-${attachment.id}`}
              name="requestId"
              density="compact"
              required
              defaultValue=""
            >
              <option value="" disabled>
                {t("chooseDocument")}
              </option>
              {documentRequests.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("filing") : t("file")}
          </Button>
          {state.error ? (
            <FieldError className="w-full text-xs">
              {actionError(state.error, t)}
            </FieldError>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}

export function InboundMailThread({
  locale,
  messages,
  inboundAddress,
  canWrite,
  showReply,
  assignPeople,
  assignProjects,
  documentRequests,
  emptyLabel,
  help,
  showHeading = true,
}: {
  locale: string;
  messages: InboundMessageView[];
  inboundAddress?: string | null;
  canWrite: boolean;
  showReply: boolean;
  assignPeople?: { id: string; label: string }[];
  assignProjects?: { id: string; label: string }[];
  documentRequests?: { id: string; label: string }[];
  emptyLabel?: string;
  help?: string;
  showHeading?: boolean;
}) {
  const t = useTranslations("inboundMail");
  const dateLocale =
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA";
  const [replyState, replyAction, replyPending] = useActionState(
    replyInboundMessageAction,
    emptyState,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignInboundMessageAction,
    emptyState,
  );

  const lastInbound = [...messages]
    .reverse()
    .find((row) => row.direction === "inbound");

  const addressHint = inboundAddress ? (
    <p className={showHeading ? "mt-1 font-mono text-sm text-brand" : "font-mono text-sm text-brand"}>
      {inboundAddress}
    </p>
  ) : inboundAddress === null ? (
    <FieldHint>{t("notConfigured")}</FieldHint>
  ) : null;

  return (
    <section className="space-y-3">
      {showHeading || addressHint ? (
        <div>
          {showHeading ? (
            <>
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("title")}
              </h2>
              <p className="text-sm text-muted-foreground">{help ?? t("help")}</p>
            </>
          ) : null}
          {addressHint}
        </div>
      ) : null}

      {messages.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">
            {emptyLabel ?? t("empty")}
          </p>
        </SurfaceCard>
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => (
            <li key={message.id}>
              <SurfaceCard className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-brand">
                      {message.subject || t("noSubject")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {message.direction === "outbound"
                        ? t("sentTo", { email: message.to_address })
                        : t("from", { email: message.from_email })}
                      {message.unknown_sender ? ` · ${t("unknownSender")}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(dateLocale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(message.received_at))}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-[15px] text-brand">
                  {message.body_text || t("emptyBody")}
                </p>
                {message.attachments.length > 0 ? (
                  <ul className="space-y-2">
                    {message.attachments.map((attachment) => (
                      <AttachmentRow
                        key={attachment.id}
                        locale={locale}
                        attachment={attachment}
                        documentRequests={documentRequests ?? []}
                        canFile={
                          canWrite &&
                          Boolean(message.project_id) &&
                          (documentRequests?.length ?? 0) > 0
                        }
                      />
                    ))}
                  </ul>
                ) : null}
                {canWrite &&
                message.assignment_status === "unassigned" &&
                (assignPeople?.length || assignProjects?.length) ? (
                  <FormStack action={assignAction} className="space-y-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="messageId" value={message.id} />
                    {assignProjects && assignProjects.length > 0 ? (
                      <Field density="compact">
                        <FieldLabel htmlFor={`project-${message.id}`}>
                          {t("assignProject")}
                        </FieldLabel>
                        <NativeSelect
                          id={`project-${message.id}`}
                          name="projectId"
                          density="compact"
                          defaultValue=""
                        >
                          <option value="">{t("none")}</option>
                          {assignProjects.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    ) : null}
                    {assignPeople && assignPeople.length > 0 ? (
                      <Field density="compact">
                        <FieldLabel htmlFor={`person-${message.id}`}>
                          {t("assignPerson")}
                        </FieldLabel>
                        <NativeSelect
                          id={`person-${message.id}`}
                          name="personId"
                          density="compact"
                          defaultValue={message.person_id ?? ""}
                        >
                          <option value="">{t("none")}</option>
                          {assignPeople.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    ) : null}
                    <Button type="submit" disabled={assignPending}>
                      {assignPending ? t("assigning") : t("assign")}
                    </Button>
                    {assignState.error ? (
                      <FieldError>
                        {actionError(assignState.error, t)}
                      </FieldError>
                    ) : null}
                  </FormStack>
                ) : null}
                {message.project_id ? (
                  <Link
                    href={`/projects/${message.project_id}`}
                    className="text-sm font-medium text-action hover:underline"
                  >
                    {t("openProject")}
                  </Link>
                ) : null}
              </SurfaceCard>
            </li>
          ))}
        </ul>
      )}

      {showReply && canWrite && lastInbound ? (
        <SurfaceCard>
          <FormStack action={replyAction} className="space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="messageId" value={lastInbound.id} />
            <Field>
              <FieldLabel htmlFor="inbound-reply" required>
                {t("replyLabel")}
              </FieldLabel>
              <Textarea
                id="inbound-reply"
                name="body"
                required
                rows={5}
                placeholder={t("replyPlaceholder")}
              />
            </Field>
            {replyState.error ? (
              <FieldError>{actionError(replyState.error, t)}</FieldError>
            ) : null}
            {replyState.message === "sent" ? (
              <p className="text-sm text-muted-foreground">{t("sent")}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={replyPending}>
                {replyPending ? t("sending") : t("sendReply")}
              </Button>
            </div>
          </FormStack>
        </SurfaceCard>
      ) : null}
    </section>
  );
}
