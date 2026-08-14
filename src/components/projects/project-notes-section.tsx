"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addProjectNoteAction,
  updateProjectNoteAction,
  type ProjectNoteActionState,
} from "@/app/actions/projects";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectNoteRow } from "@/lib/crm/queries";

const initialState: ProjectNoteActionState = {};

function NoteItem({
  locale,
  projectId,
  note,
  dateLocale,
}: {
  locale: string;
  projectId: string;
  note: ProjectNoteRow;
  dateLocale: string;
}) {
  const t = useTranslations("projects");
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateProjectNoteAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "updated") {
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

  return (
    <li className="space-y-2 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
        <div className="min-w-0 space-y-0.5">
          <span className="font-semibold text-brand/80">
            {note.author_name || t("noteAuthorUnknown")}
          </span>
          <div>
            <time dateTime={note.created_at}>
              {new Date(note.created_at).toLocaleString(dateLocale, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            {note.updated_at !== note.created_at ? (
              <span> · {t("noteEdited")}</span>
            ) : null}
          </div>
        </div>
        {editing ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            aria-label={t("editNote")}
            title={t("editNote")}
            className="text-muted-foreground hover:text-brand"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
      {editing ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="noteId" value={note.id} />
          <Textarea
            name="body"
            required
            rows={6}
            maxLength={20000}
            defaultValue={note.body}
            className="min-h-32 rounded-xl bg-surface text-[15px]"
          />
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
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
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] text-brand">{note.body}</p>
      )}
    </li>
  );
}

export function ProjectNotesSection({
  locale,
  projectId,
  notes,
}: {
  locale: string;
  projectId: string;
  notes: ProjectNoteRow[];
}) {
  const t = useTranslations("projects");
  const [state, formAction, pending] = useActionState(
    addProjectNoteAction,
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

  const dateLocale =
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA";

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("notesTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("notesCardHelp")}</p>
      </div>

      <SurfaceCard className="space-y-4">
        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="projectId" value={projectId} />
          <label className="sr-only" htmlFor="project-note-body">
            {t("notesCardPlaceholder")}
          </label>
          <Textarea
            id="project-note-body"
            name="body"
            required
            rows={6}
            maxLength={20000}
            placeholder={t("notesCardPlaceholder")}
            className="min-h-32 rounded-xl bg-surface text-[15px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : state.message === "saved" ? (
              <p className="text-sm text-emerald-700" role="status">
                {t("noteSaved")}
              </p>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending ? t("noteSaving") : t("addNote")}
            </Button>
          </div>
        </form>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("notesCardEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {notes.map((note) => (
              <NoteItem
                key={note.id}
                locale={locale}
                projectId={projectId}
                note={note}
                dateLocale={dateLocale}
              />
            ))}
          </ul>
        )}
      </SurfaceCard>
    </section>
  );
}
