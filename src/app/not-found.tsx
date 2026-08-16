import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";

import { NotFoundView } from "@/components/status/not-found-view";
import { fontClassName } from "@/lib/fonts";
import { toAppLocale } from "@/lib/i18n/locales";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = toAppLocale((await cookies()).get("NEXT_LOCALE")?.value);
  setRequestLocale(locale);
  const t = await getTranslations("statusPages");
  return {
    title: t("notFoundTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function RootNotFound() {
  const locale = toAppLocale((await cookies()).get("NEXT_LOCALE")?.value);
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${fontClassName} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <NextIntlClientProvider messages={messages}>
          <NotFoundView homeHref="/" showSignIn />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
