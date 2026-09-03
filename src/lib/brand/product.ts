/**
 * Product identity — the only place to change the app name and logo
 * while testing names. Locale copy uses %PRODUCT_NAME% (see apply-product-copy.ts).
 *
 * Operator (Yuzu Solutions Inc.) stays the legal company and is not the product.
 *
 * To try another name/logo:
 * 1. Change `name`, `wordmark`, and `mark` here.
 * 2. Reload — UI, emails, and i18n pick this up.
 * 3. Optional: `npm run legal:pdf` to refresh firm download PDFs.
 */
export type BrandMarkId = "paperPlane" | "none";

export const product = {
  /** Full public name. Used in titles, emails, legal copy, aria-labels. */
  name: "Dossierly",
  /** Short line for metadata / social. */
  tagline: "Canadian immigration consultant CRM by Yuzu Solutions",
  wordmark: {
    /** Text before the accent pill. */
    primary: "Dossierly",
    /** Accent pill. Empty string hides the pill. */
    accent: "",
  },
  /**
   * Logo mark. Marks live in `src/components/brand/brand-mark.tsx`.
   * Use `"none"` for wordmark-only.
   */
  mark: "paperPlane" satisfies BrandMarkId as BrandMarkId,
  /** Legal operator — not the product name. */
  operator: "Yuzu Solutions Inc.",
  operatorShort: "Yuzu Solutions",
  supportEmail: "info@dossierly.ca",
  /** Law 25 / PIPEDA public contact (may be the same mailbox as support). */
  privacyEmail: "info@dossierly.ca",
  domain: "dossierly.ca",
  siteUrl: "https://dossierly.ca",
} as const;

export type ProductIdentity = typeof product;

export function productFileSlug() {
  return product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
