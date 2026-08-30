/**
 * Acrobat/XFA constraints copied from IRCC template scripts (IMM 1294/1295).
 * Empty LMIA must stay null (not ""), and CWA/current-COR "To" must be after today.
 */

function pad2(value: string | number): string {
  return String(value).padStart(2, "0");
}

export function localIsoToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function localIsoTomorrow(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

/** Full YYYY-MM-DD or empty — Acrobat date pictures reject year-only / month-only. */
export function completeIsoDate(
  year?: string | null,
  month?: string | null,
  day?: string | null,
): string {
  const y = String(year ?? "").trim();
  const m = String(month ?? "").trim().padStart(2, "0");
  const d = String(day ?? "").trim().padStart(2, "0");
  if (!/^\d{4}$/.test(y) || !/^(0[1-9]|1[0-2])$/.test(m) || !/^(0[1-9]|[12]\d|3[01])$/.test(d)) {
    return "";
  }
  return `${y}-${m}-${d}`;
}

export function splitIsoDate(iso: string): { year: string; month: string; day: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return { year: "", month: "", day: "" };
  return { year: m[1], month: m[2], day: m[3] };
}

/**
 * Acrobat: CWA / current COR ToDate must be > today.
 * Empty stays empty. Today or earlier becomes tomorrow so Validate does not fail.
 */
export function ensureAfterToday(iso: string, now = new Date()): string {
  const value = iso.trim();
  if (!value) return "";
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  if (!complete) return localIsoTomorrow(now);
  if (complete > localIsoToday(now)) return complete;
  return localIsoTomorrow(now);
}

/** Acrobat: intended work/study FromDate must be >= today. Empty stays empty. */
export function ensureOnOrAfterToday(iso: string, now = new Date()): string {
  const value = iso.trim();
  if (!value) return "";
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  if (!complete) return localIsoToday(now);
  if (complete >= localIsoToday(now)) return complete;
  return localIsoToday(now);
}

export function isLmosType(raw: string): boolean {
  return String(raw || "").trim().toUpperCase() === "LMOS";
}

export function isElmoType(raw: string): boolean {
  return String(raw || "").trim().toUpperCase() === "ELMO";
}

/**
 * IMM 1295 `validateLMIAandExemptionCode`:
 * - null/empty is valid
 * - LMOS (and any non-ELMO type): 7–8 digits in [6000000, 99999999]
 * - ELMO: /^[A-Za-z]\d{7}$/  (offer of employment, e.g. A1234567)
 */
export function acrobatLmoValue(permitType: string, raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/[\s-]/g, "");
  if (isElmoType(permitType)) {
    const m = /^([A-Za-z])(\d{7})$/.exec(compact);
    return m ? `${m[1].toUpperCase()}${m[2]}` : "";
  }
  const digits = compact.replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(digits)) return "";
  const n = Number(digits);
  if (n < 6_000_000 || n > 99_999_999) return "";
  return digits;
}

export function pdfHasDocMdp(pdf: Uint8Array): boolean {
  const latin = new TextDecoder("latin1").decode(pdf);
  return latin.includes("/DocMDP") && /\/ByteRange\s*\[/.test(latin);
}

export function lmoXmlLooksEmptyString(xml: string): boolean {
  return /<LMO\n><\/LMO\n>/.test(xml) || /<LMO\n><LMO\n><\/LMO\n><\/LMO\n>/.test(xml);
}

export function cwaToIsoFromXml(xml: string): string {
  const block = xml.match(/<CountryWhereApplying\n>[\s\S]*?<\/CountryWhereApplying\n>/);
  if (!block) return "";
  const to = block[0].match(/<ToDate\n>([^<]*)<\/ToDate\n>/);
  return to?.[1]?.trim() ?? "";
}
