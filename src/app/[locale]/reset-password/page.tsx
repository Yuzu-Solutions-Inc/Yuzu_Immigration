import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { LegalLinks } from "@/components/legal/legal-links";
import { isPasswordResetRequired } from "@/lib/auth/password-reset";
import { getSessionUser } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (!(await isPasswordResetRequired())) {
    redirect(`/${locale}/home`);
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-14">
      <ResetPasswordForm locale={locale} />
      <div className="flex justify-center sm:justify-start">
        <LegalLinks />
      </div>
    </main>
  );
}
