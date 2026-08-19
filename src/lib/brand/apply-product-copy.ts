import { product } from "@/lib/brand/product";

/** Placeholder in locale JSON, legal markdown, and legal i18n sources. */
export const PRODUCT_NAME_TOKEN = "%PRODUCT_NAME%";
export const OPERATOR_NAME_TOKEN = "%OPERATOR_NAME%";

export function applyProductCopy<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replaceAll(PRODUCT_NAME_TOKEN, product.name)
      .replaceAll(OPERATOR_NAME_TOKEN, product.operator) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyProductCopy(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        applyProductCopy(nested),
      ]),
    ) as T;
  }
  return value;
}
