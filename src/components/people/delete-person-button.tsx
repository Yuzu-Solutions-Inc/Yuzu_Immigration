"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  deletePersonAction,
  type DeletePersonState,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";

const initialState: DeletePersonState = {};

export function DeletePersonButton({
  locale,
  personId,
  fullName,
  size = "sm",
}: {
  locale: string;
  personId: string;
  fullName: string;
  size?: "sm" | "xs";
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
      className="inline-flex flex-col items-end gap-1"
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
        variant="destructive"
        size={size}
        disabled={pending}
      >
        {pending ? t("deleting") : t("delete")}
      </Button>
      {errorMessage ? (
        <p className="max-w-[12rem] text-right text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
