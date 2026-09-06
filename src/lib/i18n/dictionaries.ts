import { applyProductCopy } from "@/lib/brand/apply-product-copy";
import type { AppLocale } from "@/lib/i18n/locales";
import {
  en,
  es,
  fr,
  type LocaleMessages,
} from "@/lib/i18n/message-catalogs";

export type { LocaleMessages };

export type OrgRoleLabels = {
  owner: string;
  admin: string;
  member: string;
  unlicensed: string;
};

export const dictionaries: Record<AppLocale, LocaleMessages> = {
  en: applyProductCopy(en, "en"),
  fr: applyProductCopy(fr, "fr"),
  es: applyProductCopy(es, "es"),
};

export function messagesFor(locale: AppLocale): LocaleMessages {
  return dictionaries[locale];
}

export function orgRoleLabels(locale: AppLocale): OrgRoleLabels {
  const value = dictionaries[locale].orgRoles;
  if (!value || typeof value !== "object") {
    throw new Error("orgRoles messages missing");
  }
  return value as OrgRoleLabels;
}
