"use client";

import { Copy, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { SurfaceCard } from "@/components/layout/surface-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  BUILTIN_PROGRAM_TEMPLATE_KEYS,
  type BuiltinProgramTemplateKey,
  type OrganizationProgram,
} from "@/lib/crm/org-programs";
import { formTitle } from "@/lib/ircc/catalog";
import { cn } from "@/lib/utils";

function compositionSummary(
  program: Pick<
    OrganizationProgram,
    "allows_individual" | "allows_couple" | "allows_family"
  >,
  t: ReturnType<typeof useTranslations<"orgPrograms">>,
) {
  const parts: string[] = [];
  if (program.allows_individual) parts.push(t("compositions.individual"));
  if (program.allows_couple) parts.push(t("compositions.couple"));
  if (program.allows_family) parts.push(t("compositions.family"));
  return parts.join(" · ");
}

function locationSummary(
  program: Pick<
    OrganizationProgram,
    "allows_inside_canada" | "allows_outside_canada"
  >,
  t: ReturnType<typeof useTranslations<"orgPrograms">>,
) {
  const parts: string[] = [];
  if (program.allows_outside_canada) parts.push(t("outsideCanada"));
  if (program.allows_inside_canada) parts.push(t("insideCanada"));
  return parts.join(" · ");
}

function BuiltinTemplateCard({
  templateKey,
  canManage,
}: {
  templateKey: BuiltinProgramTemplateKey;
  canManage: boolean;
}) {
  const t = useTranslations("orgPrograms");
  const tp = useTranslations("programs");

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("builtinBadge")}
          </p>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {tp(templateKey)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("builtinDescription")}
          </p>
        </div>
        {canManage ? (
          <Link
            href={`/projects/templates/new?fromBuiltin=${templateKey}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Copy className="size-4" />
            {t("duplicate")}
          </Link>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function FirmTemplateCard({
  program,
  locale,
  canManage,
}: {
  program: OrganizationProgram;
  locale: string;
  canManage: boolean;
}) {
  const t = useTranslations("orgPrograms");
  const formLocale = locale === "fr" ? "fr" : locale === "es" ? "es" : "en";
  const formPreview = program.forms
    .slice(0, 4)
    .map((form) => formTitle(form.formCode, formLocale))
    .join(" · ");
  const moreForms =
    program.forms.length > 4 ? ` +${program.forms.length - 4}` : "";

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("firmBadge")}
          </p>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {program.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {compositionSummary(program, t)}
          </p>
          <p className="text-sm text-muted-foreground">
            {locationSummary(program, t)}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/templates/new?from=${program.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Copy className="size-4" />
              {t("duplicate")}
            </Link>
            <Link
              href={`/projects/templates/${program.id}/edit`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Pencil className="size-4" />
              {t("edit")}
            </Link>
          </div>
        ) : null}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          {t("formsCount", { count: program.forms.length })}
          {formPreview ? ` — ${formPreview}${moreForms}` : ""}
        </p>
        <p>{t("documentsCount", { count: program.documents.length })}</p>
      </div>
    </SurfaceCard>
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/projects"
            className="text-sm font-medium text-action hover:underline"
          >
            ← {t("backToProjects")}
          </Link>
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("manageTitle")}
          </h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">
            {t("manageSubtitle")}
          </p>
        </div>
        {canManage ? (
          <Link
            href="/projects/templates/new"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-action text-white hover:bg-action/90",
            )}
          >
            <Plus className="size-4" />
            {t("createShort")}
          </Link>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold text-brand">
          {t("builtinSection")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("builtinSectionHelp")}</p>
        <div className="grid gap-4">
          {BUILTIN_PROGRAM_TEMPLATE_KEYS.map((key) => (
            <BuiltinTemplateCard
              key={key}
              templateKey={key}
              canManage={canManage}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold text-brand">
          {t("firmSection")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("firmSectionHelp")}</p>
        {programs.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">{t("firmEmpty")}</p>
            {canManage ? (
              <Link
                href="/projects/templates/new"
                className="mt-3 inline-flex text-sm font-medium text-action hover:underline"
              >
                {t("createShort")}
              </Link>
            ) : null}
          </SurfaceCard>
        ) : (
          <div className="grid gap-4">
            {programs.map((program) => (
              <FirmTemplateCard
                key={program.id}
                program={program}
                locale={locale}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
