import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CustomFormBuilder } from "@/components/custom-forms/custom-form-builder";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { emptyCustomFormSchema } from "@/lib/custom-forms/schema";

export default async function NewCustomFormPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}/projects/forms`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CustomFormBuilder locale={locale} initialSchema={emptyCustomFormSchema()} />
    </div>
  );
}
