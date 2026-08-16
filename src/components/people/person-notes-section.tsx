"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addPersonNoteAction,
  updatePersonNoteAction,
  type AddPersonNoteState,
} from "@/app/actions/people";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldLabel,
  FieldSuccess,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formStackVariants } from "@/lib/field-styles";
import {
  formatDateTimeInZone,
  formatTimeInZone,
  toDatetimeLocalValue,
} from "@/lib/booking/timezone";
import type { PersonMeetingItem } from "@/lib/crm/queries";

const initialState: AddPersonNoteState = {};

const MEETING_STATUSES = [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;

function meetingStatusLabel(
  t: ReturnType<typeof useTranslations>,
  status: string,
) {
  if (status === "pending_payment") return t("meetingStatus.pending_payment");
  if (MEETING_STATUSES.includes(status as (typeof MEETING_STATUSES)[number])) {
    return t(`meetingStatus.${status as (typeof MEETING_STATUSES)[number]}`);
  }
  return status;
}

function statusVariant(status: string | null) {
  if (status === "cancelled" || status === "no_show") return "destructive" as const;
  if (status === "confirmed" || status === "completed") return "default" as const;
  return "secondary" as const;
}

function MeetingFields({
  idPrefix,
  defaultOccurredAt,
  defaultStatus,
  defaultBody,
  showMeta,
  notesRequired,
}: {
  idPrefix: string;
  defaultOccurredAt: string;
  defaultStatus: string;
  defaultBody: string;
  showMeta: boolean;
  notesRequired: boolean;
}) {
  const t = useTranslations("people");

  return (
    <>
      {showMeta ? (
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-occurred-at`} required>
              {t("meetingDateTime")}
            </FieldLabel>
            <Input
              id={`${idPrefix}-occurred-at`}
              name="occurredAt"
              type="datetime-local"
              required
              step={60}
              defaultValue={defaultOccurredAt}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-status`} required>
              {t("meetingStatusLabel")}
            </FieldLabel>
            <NativeSelect
              id={`${idPrefix}-status`}
              name="status"
              required
              defaultValue={defaultStatus}
            >
              {MEETING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`meetingStatus.${status}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FieldGrid>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-body`} required={notesRequired}>
          {t("meetingNotes")}
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-body`}
          name="body"
          required={notesRequired}
          rows={6}
          maxLength={20000}
          defaultValue={defaultBody}
          placeholder={t("notesPlaceholder")}
        />
      </Field>
    </>
  );
}

function MeetingItem({
  locale,
  personId,
  timeZone,
  meeting,
}: {
  locale: string;
  personId: string;
  timeZone: string;
  meeting: PersonMeetingItem;
}) {
  const t = useTranslations("people");
  const [editing, setEditing] = useState(false);
  const isBooked = meeting.source === "booking";
  const hasNote = Boolean(meeting.noteId);
  const [state, formAction, pending] = useActionState(
    hasNote ? updatePersonNoteAction : addPersonNoteAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "updated" || state.message === "saved") {
      setEditing(false);
    }
  }, [state.message]);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        save_failed: t("errors.noteSaveFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  const occurred = new Date(meeting.occurredAt);
  const when = meeting.endsAt
    ? `${formatDateTimeInZone(occurred, timeZone, locale)} – ${formatTimeInZone(new Date(meeting.endsAt), timeZone, locale)}`
    : formatDateTimeInZone(occurred, timeZone, locale);

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <time
              dateTime={meeting.occurredAt}
              className="font-heading text-sm font-semibold text-brand"
            >
              {when}
            </time>
            {meeting.status ? (
              <Badge variant={statusVariant(meeting.status)}>
                {meetingStatusLabel(t, meeting.status)}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {isBooked ? t("meetingSourceBooked") : t("meetingSourceManual")}
            </Badge>
          </div>
          {meeting.serviceTitle || meeting.hostName ? (
            <p className="text-sm text-muted-foreground">
              {[meeting.serviceTitle, meeting.hostName].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {meeting.authorName || meeting.updatedAt !== meeting.createdAt ? (
            <p className="text-xs text-muted-foreground">
              {meeting.authorName || t("noteAuthorUnknown")}
              {meeting.updatedAt !== meeting.createdAt ? ` · ${t("noteEdited")}` : null}
            </p>
          ) : null}
        </div>
        {editing ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            aria-label={hasNote || !isBooked ? t("editMeeting") : t("addNotes")}
            title={hasNote || !isBooked ? t("editMeeting") : t("addNotes")}
            className="text-muted-foreground hover:text-brand"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>

      {editing ? (
        <FormStack action={formAction} gap="tight">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="timeZone" value={timeZone} />
          {meeting.noteId ? (
            <input type="hidden" name="noteId" value={meeting.noteId} />
          ) : null}
          {meeting.appointmentId ? (
            <input type="hidden" name="appointmentId" value={meeting.appointmentId} />
          ) : null}
          <MeetingFields
            idPrefix={meeting.key}
            defaultOccurredAt={toDatetimeLocalValue(occurred, timeZone)}
            defaultStatus={
              meeting.status &&
              MEETING_STATUSES.includes(
                meeting.status as (typeof MEETING_STATUSES)[number],
              )
                ? meeting.status
                : "completed"
            }
            defaultBody={meeting.body}
            showMeta={!isBooked}
            notesRequired={isBooked}
          />
          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              {t("cancelEditNote")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("noteSaving") : t("saveNote")}
            </Button>
          </div>
        </FormStack>
      ) : meeting.body.trim() ? (
        <p className="whitespace-pre-wrap text-[15px] text-brand">{meeting.body}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noNotesYet")}</p>
      )}
    </li>
  );
}

export function PersonNotesSection({
  locale,
  personId,
  meetings,
  timeZone,
}: {
  locale: string;
  personId: string;
  meetings: PersonMeetingItem[];
  timeZone: string;
}) {
  const t = useTranslations("people");
  const [state, formAction, pending] = useActionState(
    addPersonNoteAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message === "saved") {
      formRef.current?.reset();
    }
  }, [state.message]);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        save_failed: t("errors.noteSaveFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("notesTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("notesHelp")}</p>
      </div>

      <SurfaceCard className="space-y-4">
        <form
          ref={formRef}
          action={formAction}
          className={formStackVariants({ gap: "tight" })}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="timeZone" value={timeZone} />
          <MeetingFields
            idPrefix="new-meeting"
            defaultOccurredAt={toDatetimeLocalValue(new Date(), timeZone)}
            defaultStatus="completed"
            defaultBody=""
            showMeta
            notesRequired={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {errorMessage ? (
              <FieldError>{errorMessage}</FieldError>
            ) : state.message === "saved" ? (
              <FieldSuccess>{t("noteSaved")}</FieldSuccess>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? t("noteSaving") : t("addMeeting")}
            </Button>
          </div>
        </form>

        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("notesEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {meetings.map((meeting) => (
              <MeetingItem
                key={meeting.key}
                locale={locale}
                personId={personId}
                timeZone={timeZone}
                meeting={meeting}
              />
            ))}
          </ul>
        )}
      </SurfaceCard>
    </section>
  );
}
