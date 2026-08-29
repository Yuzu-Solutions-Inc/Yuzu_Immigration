"use client";

import { useActionState, useEffect } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  createBlankCustomFormTemplateAction,
  deleteCustomFormTemplateAction,
  type CustomFormActionState,
} from "@/app/actions/custom-forms";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { CustomFormTemplateRow } from "@/lib/custom-forms/schema";
import { localizedLabel } from "@/lib/custom-forms/schema";

const deleteInitial: CustomFormActionState = {};

function DeleteButton({
  locale,
  templateId,
  name,
}: {
  locale: string;
  templateId: string;
  name: string;
}) {
  const t = useTranslations("customForms");
  const [state, action, pending] = useActionState(
    deleteCustomFormTemplateAction,
    deleteInitial,
  );

  useEffect(() => {
    if (state.error) window.alert(t(`errors.${state.error}`));
  }, [state.error, t]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t("deleteConfirm", { name }))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="templateId" value={templateId} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-xs" }),
          "text-muted-foreground hover:text-destructive",
        )}
        aria-label={t("delete")}
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}

export function CustomFormCatalog({
  locale,
  templates,
  canManage,
}: {
  locale: string;
  templates: CustomFormTemplateRow[];
  canManage: boolean;
}) {
  const t = useTranslations("customForms");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/projects"
            className="text-sm font-medium text-action hover:underline"
          >
            ← {t("backToProjects")}
          </Link>
          <h1 className="font-heading text-xl font-semibold text-brand">
            {t("catalogTitle")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("catalogSubtitle")}
          </p>
        </div>
        {canManage ? (
          <form
            action={async () => {
              await createBlankCustomFormTemplateAction(locale);
            }}
          >
            <button
              type="submit"
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-action text-action-foreground hover:bg-action/90",
              )}
            >
              <Plus className="size-4" />
              {t("createShort")}
            </button>
          </form>
        ) : null}
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
          {t("catalogEmpty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-brand">{template.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t("sectionsCount", {
                    count: template.schema.sections.length,
                  })}
                  {template.description
                    ? ` · ${template.description}`
                    : ` · ${template.schema.sections
                        .map((section) => localizedLabel(section.title, locale))
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(", ")}`}
                </p>
              </div>
              {canManage ? (
                <div className="flex items-center gap-1">
                  <Link
                    href={`/projects/forms/${template.id}/edit`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    <Pencil className="size-4" />
                    {t("edit")}
                  </Link>
                  <DeleteButton
                    locale={locale}
                    templateId={template.id}
                    name={template.title}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
