import { operatorAsFor, product } from "@/lib/brand/product";

/** Placeholder in locale JSON, legal markdown, and legal i18n sources. */
export const PRODUCT_NAME_TOKEN = "%PRODUCT_NAME%";
export const OPERATOR_NAME_TOKEN = "%OPERATOR_NAME%";
export const OPERATOR_AS_TOKEN = "%OPERATOR_AS%";
export const OPERATOR_TRADE_NAME_TOKEN = "%OPERATOR_TRADE_NAME%";
export const SUPPORT_EMAIL_TOKEN = "%SUPPORT_EMAIL%";
export const PRIVACY_EMAIL_TOKEN = "%PRIVACY_EMAIL%";

export function applyProductCopy<T>(value: T, locale = "en"): T {
  if (typeof value === "string") {
    return value
      .replaceAll(PRODUCT_NAME_TOKEN, product.name)
      .replaceAll(OPERATOR_AS_TOKEN, operatorAsFor(locale))
      .replaceAll(OPERATOR_NAME_TOKEN, product.operator)
      .replaceAll(OPERATOR_TRADE_NAME_TOKEN, product.tradeName)
      .replaceAll(SUPPORT_EMAIL_TOKEN, product.supportEmail)
      .replaceAll(PRIVACY_EMAIL_TOKEN, product.privacyEmail) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyProductCopy(item, locale)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        applyProductCopy(nested, locale),
      ]),
    ) as T;
  }
  return value;
}
