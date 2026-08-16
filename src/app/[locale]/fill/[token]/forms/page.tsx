import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function ClientFillFormsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  redirect({ href: `/fill/${token}#forms`, locale });
}
