import countryAliases from "./country-aliases.json";
import countryCodes from "./country-codes.json";
import countriesEn from "./countries-en.json";
import countriesFr from "./countries-fr.json";
import languageCodes from "./language-codes.json";
import languagesEn from "./languages-en.json";
import languagesFr from "./languages-fr.json";

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function licFromOfficialLabels(
  value: string,
  maps: Record<string, string>[],
): string | undefined {
  const folded = fold(value);
  for (const map of maps) {
    for (const [lic, label] of Object.entries(map)) {
      if (/^\d{3}$/.test(lic) && fold(label) === folded) return lic;
    }
  }
}

export function resolveCountryLic(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{3}$/.test(raw)) return raw;
  const map = countryCodes as Record<string, string>;
  if (map[raw]) return map[raw];
  const lower = raw.toLowerCase();
  const aliases = countryAliases as Record<string, string>;
  if (aliases[lower]) return aliases[lower];
  for (const [label, lic] of Object.entries(map)) {
    if (label.toLowerCase() === lower) return lic;
  }
  const folded = fold(raw);
  for (const [label, lic] of Object.entries(map)) {
    if (fold(label) === folded) return lic;
  }
  const fromOfficial = licFromOfficialLabels(raw, [
    countriesEn as Record<string, string>,
    countriesFr as Record<string, string>,
  ]);
  if (fromOfficial) return fromOfficial;
  throw new Error(
    `Unknown country (use IRCC list name or 3-digit code): ${raw}`,
  );
}

export function resolveLanguageLic(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{3}$/.test(raw)) return raw;
  const map = languageCodes as Record<string, string>;
  if (map[raw]) return map[raw];
  const lower = raw.toLowerCase();
  for (const [label, lic] of Object.entries(map)) {
    if (label.toLowerCase() === lower) return lic;
  }
  const fromOfficial = licFromOfficialLabels(raw, [
    languagesEn as Record<string, string>,
    languagesFr as Record<string, string>,
  ]);
  if (fromOfficial) return fromOfficial;
  throw new Error(`Unknown native language (e.g. French, English): ${raw}`);
}

/** Label for text-only IRCC fields (family info, representative address). */
export function countryDisplayName(
  value: string | null | undefined,
  lang: "e" | "f" = "e",
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const primary = (lang === "f" ? countriesFr : countriesEn) as Record<
    string,
    string
  >;
  const fallback = (lang === "f" ? countriesEn : countriesFr) as Record<
    string,
    string
  >;
  if (/^\d{3}$/.test(raw)) {
    return primary[raw] || fallback[raw] || raw;
  }
  return raw;
}
