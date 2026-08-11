"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deletePersonAction,
  type DeletePersonState,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: DeletePersonState = {};

export function DeletePersonButton({
  locale,
  personId,
  fullName,
  className,
}: {
  locale: string;
  personId: string;
  fullName: string;
  className?: string;
}) {
  const t = useTranslations("people");
  const [state, formAction, pending] = useActionState(
    deletePersonAction,
    initialState,
  );

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        delete_failed: t("errors.deleteFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <form
      action={formAction}
      className={cn("inline-flex flex-col items-end gap-1", className)}
      onSubmit={(event) => {
        if (!window.confirm(t("deleteConfirm", { name: fullName }))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="personId" value={personId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={pending ? t("deleting") : t("deleteAria", { name: fullName })}
        title={t("delete")}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
      {errorMessage ? (
        <p className="max-w-[12rem] text-right text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
