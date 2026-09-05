/**
 * Product identity — the only place to change the app name and logo
 * while testing names. Locale copy uses %PRODUCT_NAME% (see apply-product-copy.ts).
 *
 * Legal entity: Les Solutions Yuzu Inc.
 * Trade name: Yuzu Solutions Inc.
 * Product: Dossierly.
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
  tagline:
    "Canadian immigration consultant CRM by Les Solutions Yuzu Inc., operating as Yuzu Solutions Inc.",
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
  /** Registered legal name — the contracting party. `%OPERATOR_NAME%`. */
  operator: "Les Solutions Yuzu Inc.",
  /** English trade / operating name. */
  tradeName: "Yuzu Solutions Inc.",
  /** Everyday short form for compact UI. */
  operatorShort: "Yuzu Solutions",
  /**
   * First-mention formula: legal name, then trade name.
   * `%OPERATOR_AS%` in locale copy.
   */
  operatorAs: {
    en: "Les Solutions Yuzu Inc., operating as Yuzu Solutions Inc.",
    fr: "Les Solutions Yuzu Inc., faisant affaire sous le nom Yuzu Solutions Inc.",
    es: "Les Solutions Yuzu Inc., que opera como Yuzu Solutions Inc.",
  },
  supportEmail: "support@dossierly.ca",
  /** Law 25 / PIPEDA public contact (may be the same mailbox as support). */
  privacyEmail: "info@dossierly.ca",
  domain: "dossierly.ca",
  siteUrl: "https://dossierly.ca",
} as const;

export type ProductIdentity = typeof product;
export type OperatorAsLocale = keyof typeof product.operatorAs;

export function operatorAsFor(locale: string) {
  const key = locale.toLowerCase().slice(0, 2);
  if (key === "fr") return product.operatorAs.fr;
  if (key === "es") return product.operatorAs.es;
  return product.operatorAs.en;
}

export function productFileSlug() {
  return product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
