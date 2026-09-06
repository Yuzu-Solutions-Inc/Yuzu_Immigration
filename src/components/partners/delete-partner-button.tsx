"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  deletePartnerFormAction,
  type PartnerFormState,
} from "@/app/actions/finance-partners";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: PartnerFormState = {};

export function DeletePartnerButton({
  locale,
  partnerId,
  name,
  className,
}: {
  locale: string;
  partnerId: string;
  name: string;
  className?: string;
}) {
  const t = useTranslations("financeApp");
  const [state, formAction, pending] = useActionState(
    deletePartnerFormAction,
    initialState,
  );

  const errorMessage = state.error
    ? state.error === "linked_records"
      ? t("partners.deleteBlocked")
      : t("partners.deleteFailed")
    : null;

  return (
    <form
      action={formAction}
      className={cn("inline-flex flex-col items-end gap-1", className)}
      onSubmit={(event) => {
        if (!window.confirm(t("partners.confirmDelete"))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={partnerId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={t("common.delete")}
        title={`${t("common.delete")}: ${name}`}
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
