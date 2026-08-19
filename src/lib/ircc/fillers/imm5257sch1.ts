/**
 * Fill IMM 5257 Schedule 1 — additional background for temporary residence.
 */
import { resolveCountryLic } from "../codes/resolve-lic";
import formMeta from "../form-meta.json";
import {
  fillXfaDatasetsIncremental,
  setTag,
  xmlEscape,
  type FormMeta,
} from "../xfa-incremental";

function yn(value: unknown): "Y" | "N" {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "TRUE" || v === "1") return "Y";
  return "N";
}

function splitMonth(value: unknown): { year: string; month: string } {
  const raw = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})/.exec(raw);
  if (iso) return { year: iso[1], month: iso[2] };
  return { year: "", month: "" };
}

function countryCode(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return resolveCountryLic(raw);
  } catch {
    return raw;
  }
}

function detailXml(
  row: Record<string, unknown>,
  extra: (row: Record<string, unknown>) => string,
): string {
  const from = splitMonth(row.from);
  const to = splitMonth(row.to);
  return (
    `<From\n><Year\n>${xmlEscape(from.year)}</Year\n>` +
    `<Month\n>${xmlEscape(from.month)}</Month\n></From\n>` +
    `<To\n><Year\n>${xmlEscape(to.year)}</Year\n>` +
    `<Month\n>${xmlEscape(to.month)}</Month\n></To\n>` +
    extra(row)
  );
}

function fillRepeats(
  xml: string,
  tag: string,
  rows: Record<string, unknown>[],
  extra: (row: Record<string, unknown>) => string,
): string {
  let i = 0;
  return xml.replace(
    new RegExp(`<${tag}\\n/>`, "g"),
    () => {
      const row = rows[i++];
      if (!row) return `<${tag}\n/>`;
      return `<${tag}\n>${detailXml(row, extra)}</${tag}\n>`;
    },
  );
}

function setYnNil(xml: string, tag: string, value: "Y" | "N"): string {
  const nil = new RegExp(
    `<${tag}[^>]*xsi:nil="true"[^/]*/>|<${tag}[^>]*xsi:nil="true"[^>]*>\\s*</${tag}\\n?>`,
  );
  if (nil.test(xml)) {
    return xml.replace(nil, `<${tag}\n>${value}</${tag}\n>`);
  }
  return setTag(xml, tag, value);
}

export type Imm5257Sch1Answers = {
  familyName: string;
  givenName: string;
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  bgMilitary?: unknown;
  bgWitness?: unknown;
  bgViolence?: unknown;
  hasMembership?: unknown;
  heldGovPosition?: unknown;
  traveledOtherCountry?: unknown;
  militaryServiceRows?: unknown;
  warCrimesRows?: unknown;
  membershipRows?: unknown;
  governmentPositionRows?: unknown;
  previousTravelRows?: unknown;
};

export function patchSchedule1(xml: string, a: Imm5257Sch1Answers): string {
  let out = xml;
  const start = out.lastIndexOf("<xfa:data");
  const data = start >= 0 ? out.slice(start) : out;
  let d = data;

  if (!d.includes("<FamilyName")) {
    d = d.replace(
      /<FormName\n>/,
      `<FamilyName\n>${xmlEscape(a.familyName)}</FamilyName\n>` +
        `<GivenName\n>${xmlEscape(a.givenName)}</GivenName\n>` +
        `<ApplicantBirthDate\n><Year\n>${xmlEscape(a.dobYear)}</Year\n>` +
        `<Month\n>${xmlEscape(a.dobMonth)}</Month\n>` +
        `<Day\n>${xmlEscape(a.dobDay)}</Day\n></ApplicantBirthDate\n>` +
        `<FormName\n>`,
    );
  } else {
    d = setTag(d, "FamilyName", a.familyName);
    d = setTag(d, "GivenName", a.givenName);
  }

  d = setYnNil(d, "ServedInMilitary", yn(a.bgMilitary));
  d = setYnNil(d, "HaveWitnessedParticipated", yn(a.bgViolence) === "Y" || yn(a.bgWitness) === "Y" ? "Y" : "N");
  d = setYnNil(d, "BeenMemberAssociated", yn(a.hasMembership));
  d = setYnNil(d, "HeldGovernmentPositions", yn(a.heldGovPosition));
  d = setYnNil(d, "TraveledOtherCountry", yn(a.traveledOtherCountry));

  const asRows = (value: unknown) =>
    Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  d = fillRepeats(d, "MilitaryServiceDetail", asRows(a.militaryServiceRows), (row) =>
    `<Location\n>${xmlEscape(String(row.location || row.city || ""))}</Location\n>` +
      `<Province\n>${xmlEscape(String(row.provinceState || ""))}</Province\n>` +
      `<CountryCode\n>${xmlEscape(countryCode(row.country))}</CountryCode\n>`,
  );
  d = fillRepeats(d, "WarHumanityCrimesDetail", asRows(a.warCrimesRows), (row) =>
    `<Location\n>${xmlEscape(String(row.location || row.city || ""))}</Location\n>` +
      `<Province\n>${xmlEscape(String(row.provinceState || ""))}</Province\n>` +
      `<CountryCode\n>${xmlEscape(countryCode(row.country))}</CountryCode\n>` +
      `<Details\n>${xmlEscape(String(row.details || ""))}</Details\n>`,
  );
  d = fillRepeats(d, "MembershipAssociationDetail", asRows(a.membershipRows), (row) =>
    `<NameOfOrganization\n>${xmlEscape(String(row.organization || ""))}</NameOfOrganization\n>` +
      `<ActivitiesPositionHeld\n>${xmlEscape(String(row.position || row.activities || ""))}</ActivitiesPositionHeld\n>` +
      `<Province\n>${xmlEscape(String(row.provinceState || ""))}</Province\n>` +
      `<CountryCode\n>${xmlEscape(countryCode(row.country))}</CountryCode\n>`,
  );
  d = fillRepeats(d, "GovernmentPositionsDetail", asRows(a.governmentPositionRows), (row) =>
    `<CountryCode\n>${xmlEscape(countryCode(row.country))}</CountryCode\n>` +
      `<LevelOfJurisdiction\n>${xmlEscape(String(row.level || ""))}</LevelOfJurisdiction\n>` +
      `<DepartmentBranch\n>${xmlEscape(String(row.department || ""))}</DepartmentBranch\n>` +
      `<ActivitiesPositionHeld\n>${xmlEscape(String(row.position || row.activities || ""))}</ActivitiesPositionHeld\n>`,
  );
  d = fillRepeats(d, "PreviousTravelDetail", asRows(a.previousTravelRows), (row) =>
    `<CountryCode\n>${xmlEscape(countryCode(row.country))}</CountryCode\n>` +
      `<Location\n>${xmlEscape(String(row.location || row.city || ""))}</Location\n>` +
      `<PurposeOfTravel\n>${xmlEscape(String(row.purpose || ""))}</PurposeOfTravel\n>`,
  );

  return start >= 0 ? out.slice(0, start) + d : d;
}

export async function fillImm5257Sch1Pdf(
  blankPdf: Uint8Array,
  answers: Imm5257Sch1Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm5257sch1${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) =>
    patchSchedule1(xml, answers),
  );
}
