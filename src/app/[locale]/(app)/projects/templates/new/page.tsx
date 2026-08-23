import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import {
  getOrganizationProgram,
} from "@/app/actions/org-programs";
import { SurfaceCard } from "@/components/layout/surface-card";
import { OrganizationProgramForm } from "@/components/projects/organization-program-form";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import {
  builtinProgramTemplateDraft,
  draftFromOrganizationProgram,
  isBuiltinProgramTemplateKey,
  type OrganizationProgramDraftInput,
} from "@/lib/crm/org-programs";

export default async function NewProjectTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; fromBuiltin?: string }>;
}) {
  const { locale } = await params;
  const { from, fromBuiltin } = await searchParams;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}/projects/templates`);
  }

  const t = await getTranslations("orgPrograms");
  const tp = await getTranslations("programs");

  let initial: OrganizationProgramDraftInput | null = null;
  let pageTitle = t("createTitle");

  if (from && /^[0-9a-f-]{36}$/i.test(from)) {
    const source = await getOrganizationProgram(from);
    if (source) {
      initial = draftFromOrganizationProgram(source, {
        nameSuffix: t("copySuffix"),
      });
      pageTitle = t("duplicateTitle");
    }
  } else if (fromBuiltin && isBuiltinProgramTemplateKey(fromBuiltin)) {
    const draft = builtinProgramTemplateDraft(fromBuiltin);
    initial = {
      name: `${tp(fromBuiltin)} ${t("copySuffix")}`.trim().slice(0, 120),
      allows_individual: draft.allowsIndividual,
      allows_couple: draft.allowsCouple,
      allows_family: draft.allowsFamily,
      allows_inside_canada: draft.allowsInsideCanada,
      allows_outside_canada: draft.allowsOutsideCanada,
      forms: draft.forms,
      documents: draft.documents,
    };
    pageTitle = t("duplicateTitle");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/projects/templates"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToTemplates")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {pageTitle}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SurfaceCard>
        <OrganizationProgramForm
          locale={locale}
          mode="create"
          initial={initial}
        />
      </SurfaceCard>
    </div>
  );
}
