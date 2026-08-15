"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deleteProjectAction,
  type DeleteProjectState,
} from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: DeleteProjectState = {};

export function DeleteProjectButton({
  locale,
  projectId,
  title,
  className,
  variant = "icon",
}: {
  locale: string;
  projectId: string;
  title: string;
  className?: string;
  variant?: "icon" | "button";
}) {
  const t = useTranslations("projects");
  const [state, formAction, pending] = useActionState(
    deleteProjectAction,
    initialState,
  );

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        delete_failed: t("errors.deleteFailed"),
        not_found: t("errors.notFound"),
        forbidden: t("errors.forbidden"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <form
      action={formAction}
      className={cn("inline-flex flex-col items-end gap-1", className)}
      onSubmit={(event) => {
        if (!window.confirm(t("deleteConfirm", { title }))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="projectId" value={projectId} />
      {variant === "button" ? (
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {pending ? t("deleting") : t("delete")}
        </Button>
      ) : (
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label={pending ? t("deleting") : t("deleteAria", { title })}
          title={t("delete")}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
      {errorMessage ? (
        <p className="max-w-[12rem] text-right text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
