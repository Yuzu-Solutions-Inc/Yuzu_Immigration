import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AnalyticsConsent } from "@/components/legal/analytics-consent";
import { Toaster } from "@/components/ui/sonner";
import { fontClassName } from "@/lib/fonts";
import { routing } from "@/i18n/routing";

import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${fontClassName} h-full antialiased`}>
      <body className="flex min-h-full min-w-0 flex-col bg-background font-sans text-foreground">
        <NextIntlClientProvider messages={messages}>
          <div className="flex min-h-full min-w-0 flex-1 flex-col">{children}</div>
          <Toaster />
          <AnalyticsConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
