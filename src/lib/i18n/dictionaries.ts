import { applyProductCopy } from "@/lib/brand/apply-product-copy";
import type { AppLocale } from "@/lib/i18n/locales";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";

export const dictionaries = {
  en: applyProductCopy(en),
  fr: applyProductCopy(fr),
  es: applyProductCopy(es),
} as const;

export function messagesFor(locale: AppLocale) {
  return dictionaries[locale];
}
