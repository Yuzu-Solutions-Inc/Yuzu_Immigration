/** PDF filenames served to firms. Sibling `.md` files are the templates; run `npm run legal:pdf` after editing them. */
export const FIRM_DPA_DOWNLOAD_FILE = "firm-data-processing-addendum.pdf";

export const LEGAL_DOWNLOAD_FILES = [
  {
    id: "governance",
    file: "yuzu-governance-summary.pdf",
    group: "yuzu",
  },
  {
    id: "subprocessors",
    file: "yuzu-subprocessors.pdf",
    group: "yuzu",
  },
  {
    id: "vendorPack",
    file: "vendor-due-diligence-pack.pdf",
    group: "firm",
  },
  {
    id: "dpa",
    file: FIRM_DPA_DOWNLOAD_FILE,
    group: "firm",
  },
  {
    id: "efvp",
    file: "firm-efvp-template.pdf",
    group: "firm",
  },
  {
    id: "privacyNotice",
    file: "firm-privacy-notice-template.pdf",
    group: "firm",
  },
  {
    id: "consent",
    file: "firm-consent-retainer-language.pdf",
    group: "firm",
  },
  {
    id: "incidentRegister",
    file: "firm-confidentiality-incident-register.pdf",
    group: "firm",
  },
  {
    id: "incidentNotices",
    file: "firm-incident-notice-templates.pdf",
    group: "firm",
  },
  {
    id: "rightsRequest",
    file: "firm-individual-rights-request.pdf",
    group: "firm",
  },
  {
    id: "destruction",
    file: "firm-destruction-register.pdf",
    group: "firm",
  },
] as const;

export type LegalDownloadId = (typeof LEGAL_DOWNLOAD_FILES)[number]["id"];

export function legalPackLocale(locale: string): "en" | "fr" {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function legalDownloadHref(file: string, locale: string): string {
  return `/legal/${legalPackLocale(locale)}/${file}`;
}
