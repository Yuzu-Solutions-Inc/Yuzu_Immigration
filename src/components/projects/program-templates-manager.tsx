"use client";

import type { ReactNode } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import {
  deleteOrganizationProgramAction,
  type OrgProgramActionState,
} from "@/app/actions/org-programs";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  BUILTIN_PROGRAM_TEMPLATE_KEYS,
  type BuiltinProgramTemplateKey,
  type OrganizationProgram,
} from "@/lib/crm/org-programs";
import { cn } from "@/lib/utils";

const deleteInitial: OrgProgramActionState = {};

function metaLine(
  program: Pick<
    OrganizationProgram,
    | "allows_individual"
    | "allows_couple"
    | "allows_family"
    | "allows_inside_canada"
    | "allows_outside_canada"
    | "forms"
    | "documents"
    | "custom_forms"
  >,
  t: ReturnType<typeof useTranslations<"orgPrograms">>,
) {
  const composition: string[] = [];
  if (program.allows_individual) composition.push(t("compositions.individual"));
  if (program.allows_couple) composition.push(t("compositions.couple"));
  if (program.allows_family) composition.push(t("compositions.family"));

  const location: string[] = [];
  if (program.allows_outside_canada) location.push(t("outsideCanada"));
  if (program.allows_inside_canada) location.push(t("insideCanada"));

  return [
    composition.join(" / "),
    location.join(" / "),
    t("formsCount", { count: program.forms.length }),
    t("customFormsCount", { count: program.custom_forms.length }),
    t("documentsCount", { count: program.documents.length }),
  ]
    .filter(Boolean)
    .join(" · ");
}

function DeleteTemplateButton({
  locale,
  programId,
  name,
}: {
  locale: string;
  programId: string;
  name: string;
}) {
  const t = useTranslations("orgPrograms");
  const [state, action, pending] = useActionState(
    deleteOrganizationProgramAction,
    deleteInitial,
  );

  useEffect(() => {
    if (state.error) {
      window.alert(t(`errors.${state.error}`));
    }
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
      <input type="hidden" name="programId" value={programId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label={t("delete")}
        title={t("delete")}
      >
        <Trash2 className="size-3.5" />
      </button>
    </form>
  );
}

function RowActions({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex shrink-0 items-center gap-0.5">{children}</div>;
}

function TemplateRow({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge: string;
  actions: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-sm font-medium text-brand">{title}</p>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        </div>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions}
    </li>
  );
}

function BuiltinTemplateRow({
  templateKey,
  canManage,
}: {
  templateKey: BuiltinProgramTemplateKey;
  canManage: boolean;
}) {
  const t = useTranslations("orgPrograms");
  const tp = useTranslations("programs");

  return (
    <TemplateRow
      title={tp(templateKey)}
      subtitle={t("builtinDescriptionShort")}
      badge={t("builtinBadge")}
      actions={
        canManage ? (
          <RowActions>
            <Link
              href={`/projects/templates/new?fromBuiltin=${templateKey}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-brand"
              aria-label={t("duplicate")}
              title={t("duplicate")}
            >
              <Copy className="size-3.5" />
            </Link>
          </RowActions>
        ) : null
      }
    />
  );
}

function FirmTemplateRow({
  program,
  locale,
  canManage,
}: {
  program: OrganizationProgram;
  locale: string;
  canManage: boolean;
}) {
  const t = useTranslations("orgPrograms");

  return (
    <TemplateRow
      title={program.name}
      subtitle={metaLine(program, t)}
      badge={t("firmBadge")}
      actions={
        canManage ? (
          <RowActions>
            <Link
              href={`/projects/templates/new?from=${program.id}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-brand"
              aria-label={t("duplicate")}
              title={t("duplicate")}
            >
              <Copy className="size-3.5" />
            </Link>
            <Link
              href={`/projects/templates/${program.id}/edit`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-brand"
              aria-label={t("edit")}
              title={t("edit")}
            >
              <Pencil className="size-3.5" />
            </Link>
            <DeleteTemplateButton
              locale={locale}
              programId={program.id}
              name={program.name}
            />
          </RowActions>
        ) : null
      }
    />
  );
}

export function ProgramTemplatesManager({
  locale,
  programs,
  canManage,
}: {
  locale: string;
  programs: OrganizationProgram[];
  canManage: boolean;
}) {
  const t = useTranslations("orgPrograms");

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
            {t("manageTitle")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("manageSubtitle")}
          </p>
        </div>
        {canManage ? (
          <Link
            href="/projects/templates/new"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-action text-action-foreground hover:bg-action/90",
            )}
          >
            <Plus className="size-4" />
            {t("createShort")}
          </Link>
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-brand">
          {t("builtinSection")}
        </h2>
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {BUILTIN_PROGRAM_TEMPLATE_KEYS.map((key) => (
            <BuiltinTemplateRow
              key={key}
              templateKey={key}
              canManage={canManage}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-brand">{t("firmSection")}</h2>
        {programs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            {t("firmEmpty")}{" "}
            {canManage ? (
              <Link
                href="/projects/templates/new"
                className="font-medium text-action hover:underline"
              >
                {t("createShort")}
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {programs.map((program) => (
              <FirmTemplateRow
                key={program.id}
                program={program}
                locale={locale}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
