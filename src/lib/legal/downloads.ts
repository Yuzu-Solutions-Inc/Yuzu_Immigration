export const LEGAL_DOWNLOAD_FILES = [
  {
    id: "governance",
    file: "yuzu-governance-summary.md",
    group: "yuzu",
  },
  {
    id: "subprocessors",
    file: "yuzu-subprocessors.md",
    group: "yuzu",
  },
  {
    id: "vendorPack",
    file: "vendor-due-diligence-pack.md",
    group: "firm",
  },
  {
    id: "dpa",
    file: "firm-data-processing-addendum.md",
    group: "firm",
  },
  {
    id: "efvp",
    file: "firm-efvp-template.md",
    group: "firm",
  },
  {
    id: "privacyNotice",
    file: "firm-privacy-notice-template.md",
    group: "firm",
  },
  {
    id: "consent",
    file: "firm-consent-retainer-language.md",
    group: "firm",
  },
  {
    id: "incidentRegister",
    file: "firm-confidentiality-incident-register.md",
    group: "firm",
  },
  {
    id: "incidentNotices",
    file: "firm-incident-notice-templates.md",
    group: "firm",
  },
  {
    id: "rightsRequest",
    file: "firm-individual-rights-request.md",
    group: "firm",
  },
  {
    id: "destruction",
    file: "firm-destruction-register.md",
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
