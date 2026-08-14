export const APP_LOCALES = ["en", "fr", "es"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

export function toAppLocale(value: string | null | undefined): AppLocale {
  if (value && isAppLocale(value)) return value;
  return "en";
}

/** Swap the leading `/{locale}` segment of an internal path. */
export function replacePathLocale(path: string, locale: AppLocale): string {
  const match = path.match(/^(\/)([a-z]{2})(\/|$)/);
  if (match && isAppLocale(match[2])) {
    return path.replace(/^\/[a-z]{2}(?=\/|$)/, `/${locale}`);
  }
  if (path === "/" || path === "") return `/${locale}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
};
