import { APP_LOCALES, toAppLocale, type AppLocale } from "@/lib/i18n/locales";

export type ServiceLocaleCopy = {
  title: string;
  description: string;
};

export type ServiceTranslations = Partial<Record<AppLocale, ServiceLocaleCopy>>;

export type ServiceCopySource = {
  title?: string | null;
  description?: string | null;
  translations?: unknown;
};

function cleanCopy(entry: unknown): ServiceLocaleCopy | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const title =
    typeof (entry as { title?: unknown }).title === "string"
      ? (entry as { title: string }).title.trim()
      : "";
  if (!title || title.length > 120) return null;
  const description =
    typeof (entry as { description?: unknown }).description === "string"
      ? (entry as { description: string }).description.trim()
      : "";
  if (description.length > 2000) return null;
  return { title, description };
}

export function parseServiceTranslations(raw: unknown): ServiceTranslations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const translations: ServiceTranslations = {};
  for (const locale of APP_LOCALES) {
    const copy = cleanCopy((raw as Record<string, unknown>)[locale]);
    if (copy) translations[locale] = copy;
  }
  return translations;
}

export function serviceCopy(
  source: ServiceCopySource | null | undefined,
  locale?: string | null,
  fallbackLocale?: string | null,
): ServiceLocaleCopy {
  const translations = parseServiceTranslations(source?.translations);
  const preferred = toAppLocale(locale);
  const fallback = toAppLocale(fallbackLocale);
  const column: ServiceLocaleCopy = {
    title: source?.title?.trim() || "",
    description: source?.description?.trim() || "",
  };

  const pick = (code: AppLocale) => {
    const copy = translations[code];
    return copy?.title ? copy : null;
  };

  return (
    pick(preferred) ??
    pick(fallback) ??
    (column.title ? column : null) ??
    APP_LOCALES.map(pick).find(Boolean) ?? {
      title: column.title || "Service",
      description: column.description,
    }
  );
}

export function serviceTitle(
  source: ServiceCopySource | null | undefined,
  locale?: string | null,
  fallbackLocale?: string | null,
) {
  return serviceCopy(source, locale, fallbackLocale).title;
}
