import type { Metadata } from "next";

import { product } from "@/lib/brand/product";
import {
  APP_LOCALES,
  toAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";
import { routing } from "@/i18n/routing";
import { PRICING } from "@/lib/marketing/pricing";

export const SITE_ORIGIN = product.siteUrl;

export const INDEXABLE_PATHS = [
  "/",
  "/pricing",
  "/help",
  "/docs",
  "/privacy",
  "/terms",
  "/dpa",
] as const;

export type IndexablePath = (typeof INDEXABLE_PATHS)[number];

/** Paths Google should not crawl. Locale-prefixed app, portal, and token routes. */
export const ROBOTS_DISALLOW = [
  "/api/",
  "/auth/",
  "/*/login",
  "/*/home",
  "/*/projects",
  "/*/clients",
  "/*/people",
  "/*/partners",
  "/*/files",
  "/*/engagements",
  "/*/calendar",
  "/*/settings",
  "/*/services",
  "/*/bookings",
  "/*/welcome",
  "/*/onboarding",
  "/*/portal",
  "/*/book/",
  "/*/booking/",
  "/*/pay/",
  "/*/sign/",
  "/*/invite/",
  "/*/reset-password",
  "/*/legal/accept",
  "/*/unsubscribe",
] as const;

const PATH_PRIORITY: Record<IndexablePath, number> = {
  "/": 1,
  "/pricing": 0.9,
  "/help": 0.6,
  "/docs": 0.6,
  "/privacy": 0.5,
  "/terms": 0.5,
  "/dpa": 0.4,
};

const OG_LOCALE: Record<AppLocale, string> = {
  en: "en_CA",
  fr: "fr_CA",
  es: "es_ES",
};

export const noIndexRobots = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;

export const noIndexMetadata = {
  robots: noIndexRobots,
} satisfies Metadata;

export function localizedPath(locale: string, path: IndexablePath): string {
  const loc = toAppLocale(locale);
  return path === "/" ? `/${loc}` : `/${loc}${path}`;
}

export function absoluteUrl(locale: string, path: IndexablePath): string {
  return `${SITE_ORIGIN}${localizedPath(locale, path)}`;
}

export function languageAlternates(
  path: IndexablePath,
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of APP_LOCALES) {
    languages[locale] = absoluteUrl(locale, path);
  }
  languages["x-default"] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

export function sitemapEntries(): {
  url: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
  alternates: { languages: Record<string, string> };
}[] {
  return INDEXABLE_PATHS.flatMap((path) =>
    APP_LOCALES.map((locale) => ({
      url: absoluteUrl(locale, path),
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: PATH_PRIORITY[path],
      alternates: { languages: languageAlternates(path) },
    })),
  );
}

export function publicPageMetadata({
  locale,
  path,
  title,
  description,
  absoluteTitle = false,
}: {
  locale: string;
  path: IndexablePath;
  title: string;
  description: string;
  absoluteTitle?: boolean;
}): Metadata {
  const loc = toAppLocale(locale);
  const url = absoluteUrl(loc, path);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      url,
      siteName: product.name,
      title,
      description,
      locale: OG_LOCALE[loc],
      alternateLocale: APP_LOCALES.filter((item) => item !== loc).map(
        (item) => OG_LOCALE[item],
      ),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export type FaqItem = { question: string; answer: string };

function organizationNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: product.name,
    legalName: product.operator,
    alternateName: product.tradeName,
    url: SITE_ORIGIN,
    email: product.supportEmail,
    areaServed: { "@type": "Country", name: "Canada" },
  };
}

export function landingJsonLd({
  locale,
  title,
  description,
  faqs,
}: {
  locale: string;
  title: string;
  description: string;
  faqs: FaqItem[];
}) {
  const url = absoluteUrl(locale, "/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_ORIGIN}/#software`,
        name: product.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: [...APP_LOCALES],
        description,
        url,
        offers: {
          "@type": "Offer",
          price: PRICING.standard.listMonthly.toFixed(2),
          priceCurrency: PRICING.currency,
        },
        publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: product.name,
        url: SITE_ORIGIN,
        inLanguage: [...APP_LOCALES],
        publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: toAppLocale(locale),
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        about: { "@id": `${SITE_ORIGIN}/#software` },
      },
      faqPageNode(`${url}#faq`, faqs),
    ],
  };
}

export function faqPageJsonLd(locale: string, path: IndexablePath, faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    ...faqPageNode(`${absoluteUrl(locale, path)}#faq`, faqs),
  };
}

function faqPageNode(id: string, faqs: FaqItem[]) {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
