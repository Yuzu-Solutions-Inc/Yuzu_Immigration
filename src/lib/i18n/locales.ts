export const APP_LOCALES = ["en", "fr", "es"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

export function toAppLocale(value: string | null | undefined): AppLocale {
  if (value && isAppLocale(value)) return value;
  return "en";
}

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
};
