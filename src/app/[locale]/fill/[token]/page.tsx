import { getTranslations, setRequestLocale } from "next-intl/server";

import { ClientFillForm } from "@/components/forms/client-fill-form";
import { loadShareContext } from "@/lib/ircc/project-forms";

export default async function ClientFillPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("forms");
  const ctx = await loadShareContext(token);

  if (!ctx) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("linkExpiredTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {t("linkExpiredBody")}
        </p>
      </div>
    );
  }

  return (
    <ClientFillForm
      token={token}
      formCodes={ctx.forms.map((f) => f.form_code)}
      initialAnswers={ctx.answers}
      projectTitle={String(ctx.project.title)}
      expiresAt={ctx.expiresAt}
    />
  );
}
