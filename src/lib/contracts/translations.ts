import {
  htmlToPlainText,
  sanitizeContractHtml,
} from "@/lib/contracts/html";
import { MAX_CONTRACT_HTML_CHARS } from "@/lib/contracts/types";
import {
  APP_LOCALES,
  isAppLocale,
  toAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";

export type ContractTranslations = Partial<Record<AppLocale, string>>;

export function hasContractCopy(html?: string | null) {
  if (!html) return false;
  return htmlToPlainText(html).trim().length > 0;
}

export function parseContractTranslations(raw: unknown): ContractTranslations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const translations: ContractTranslations = {};
  for (const locale of APP_LOCALES) {
    const entry = (raw as Record<string, unknown>)[locale];
    let html = "";
    if (typeof entry === "string") html = entry;
    else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const body =
        (entry as { body_html?: unknown; bodyHtml?: unknown }).body_html ??
        (entry as { bodyHtml?: unknown }).bodyHtml;
      if (typeof body === "string") html = body;
    }
    const sanitized = sanitizeContractHtml(html, MAX_CONTRACT_HTML_CHARS);
    if (!hasContractCopy(sanitized)) continue;
    translations[locale] = sanitized;
  }
  return translations;
}

export function pickContractBody(input: {
  translations?: unknown;
  fallbackHtml: string;
  preferredLocale?: string | null;
  orgDefaultLocale?: string | null;
}): { html: string; locale: AppLocale } {
  const translations = parseContractTranslations(input.translations);
  const orgDefault = toAppLocale(input.orgDefaultLocale);
  const preferred =
    input.preferredLocale && isAppLocale(input.preferredLocale)
      ? input.preferredLocale
      : null;
  const fallback = hasContractCopy(input.fallbackHtml)
    ? sanitizeContractHtml(input.fallbackHtml)
    : "";

  if (preferred && translations[preferred]) {
    return { html: translations[preferred]!, locale: preferred };
  }
  if (translations[orgDefault]) {
    return { html: translations[orgDefault]!, locale: orgDefault };
  }
  if (fallback) return { html: fallback, locale: orgDefault };
  for (const locale of APP_LOCALES) {
    if (translations[locale]) {
      return { html: translations[locale]!, locale };
    }
  }
  return { html: fallback || sanitizeContractHtml("<p></p>"), locale: orgDefault };
}
