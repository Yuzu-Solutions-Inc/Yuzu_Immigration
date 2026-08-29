import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CustomFormBuilder } from "@/components/custom-forms/custom-form-builder";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getCustomFormTemplate } from "@/lib/custom-forms/queries";

export default async function EditCustomFormPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}/projects/forms`);
  }

  const template = await getCustomFormTemplate(membership.organization.id, id);
  if (!template) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CustomFormBuilder
        locale={locale}
        templateId={template.id}
        initialTitle={template.title}
        initialDescription={template.description ?? ""}
        initialSchema={template.schema}
      />
    </div>
  );
}
