import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function ClientFillDocumentsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  redirect({ href: `/fill/${token}#documents`, locale });
}
