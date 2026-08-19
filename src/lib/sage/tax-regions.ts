export type CaProvinceCode =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NT"
  | "NS"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export const CA_PROVINCES: Array<{
  code: CaProvinceCode;
  name: string;
  percent: number;
  label: string;
}> = [
  { code: "AB", name: "Alberta", percent: 5, label: "GST" },
  { code: "BC", name: "British Columbia", percent: 12, label: "GST + PST" },
  { code: "MB", name: "Manitoba", percent: 12, label: "GST + RST" },
  { code: "NB", name: "New Brunswick", percent: 15, label: "HST" },
  { code: "NL", name: "Newfoundland and Labrador", percent: 15, label: "HST" },
  { code: "NT", name: "Northwest Territories", percent: 5, label: "GST" },
  { code: "NS", name: "Nova Scotia", percent: 15, label: "HST" },
  { code: "NU", name: "Nunavut", percent: 5, label: "GST" },
  { code: "ON", name: "Ontario", percent: 13, label: "HST" },
  { code: "PE", name: "Prince Edward Island", percent: 15, label: "HST" },
  { code: "QC", name: "Quebec", percent: 14.975, label: "GST + QST" },
  { code: "SK", name: "Saskatchewan", percent: 11, label: "GST + PST" },
  { code: "YT", name: "Yukon", percent: 5, label: "GST" },
];

const CA_BY_CODE = new Map(CA_PROVINCES.map((row) => [row.code, row]));
const CA_BY_NAME = new Map(
  CA_PROVINCES.map((row) => [row.name.toLowerCase(), row]),
);

export function normalizeCountryCode(raw: string | null | undefined) {
  const value = raw?.trim().toUpperCase();
  if (!value) return null;
  if (value === "CAN" || value === "CANADA") return "CA";
  if (value === "USA" || value === "UNITED STATES") return "US";
  if (value.length === 2) return value;
  return value.slice(0, 2);
}

export function normalizeCaRegion(raw: string | null | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  const upper = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (upper.length === 2 && CA_BY_CODE.has(upper as CaProvinceCode)) {
    return upper as CaProvinceCode;
  }
  const byName = CA_BY_NAME.get(value.toLowerCase());
  return byName?.code ?? null;
}

export function caRegionName(code: string | null | undefined) {
  if (!code) return null;
  return CA_BY_CODE.get(code.toUpperCase() as CaProvinceCode)?.name ?? code;
}

export function expectedCaTax(region: string | null | undefined) {
  if (!region) return null;
  return CA_BY_CODE.get(region.toUpperCase() as CaProvinceCode) ?? null;
}

/** Country/region is enough to compute tax (CA needs a province). */
export function hasTaxJurisdiction(input: {
  country: string | null | undefined;
  region: string | null | undefined;
}) {
  const country = normalizeCountryCode(input.country);
  if (!country) return false;
  if (country === "CA") return Boolean(normalizeCaRegion(input.region));
  return true;
}

export function taxCentsFromPercent(subtotalCents: number, percent: number) {
  if (subtotalCents <= 0 || percent <= 0) return 0;
  return Math.round(subtotalCents * (percent / 100));
}

export const PAY_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "CA", name: "Canada" },
  { code: "US", name: "United States" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "MX", name: "Mexico" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "PH", name: "Philippines" },
  { code: "NG", name: "Nigeria" },
  { code: "BR", name: "Brazil" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "MA", name: "Morocco" },
  { code: "DZ", name: "Algeria" },
  { code: "TN", name: "Tunisia" },
  { code: "LB", name: "Lebanon" },
  { code: "HT", name: "Haiti" },
  { code: "CO", name: "Colombia" },
  { code: "OTHER", name: "Other" },
];
