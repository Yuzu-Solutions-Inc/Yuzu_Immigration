/**
 * Fill IMM 1294 while preserving IRCC DocMDP certification.
 *
 * Strategy: incremental update of the original encrypted PDF — only append a
 * replacement for the XFA datasets stream (obj 113). Signed byte ranges stay intact.
 */

import { deflate, inflate } from "pako";
import { md5 } from "js-md5";
import cityCodes from "../codes/city-codes-data";
import { resolveCountryLic, resolveLanguageLic } from "../codes/resolve-lic";
import {
  ensureAfterToday,
  splitIsoDate,
} from "../acrobat-constraints";
import {
  type CorRow,
  type EducationRow,
  type JobRow,
  type PrevSpouse,
  type ResidentialAddress,
  type YesNo,
  isoDate,
  yn,
} from "./imm1294-branches";

export type { YesNo, CorRow, EducationRow, JobRow, PrevSpouse, ResidentialAddress };

export type Imm1294Answers = {
  email: string;
  familyName: string;
  givenName: string;
  uci?: string;
  sex: "Male" | "Female" | "Unknown" | "Unspecified";
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  placeBirthCity: string;
  placeBirthCountry: string;
  citizenship: string;
  maritalStatus: string;
  /** Spouse fields when maritalStatus is 01/03 */
  spouseFamilyName?: string;
  spouseGivenName?: string;
  marriageYear?: string;
  marriageMonth?: string;
  marriageDay?: string;
  currentCountry: string;
  currentStatus: string;
  /** From/to when current status is temporary (03/04/05/06) */
  corFromYear?: string;
  corFromMonth?: string;
  corFromDay?: string;
  corToYear?: string;
  corToMonth?: string;
  corToDay?: string;
  corOther?: string;
  previousCor: YesNo;
  previousCorRows?: CorRow[];
  sameAsCor: YesNo;
  cwaRow?: CorRow;
  previouslyMarried: YesNo;
  prevSpouse?: PrevSpouse;
  hasAlias: YesNo;
  aliasFamilyName?: string;
  aliasGivenName?: string;
  hasNatId: YesNo;
  natIdNumber?: string;
  natIdCountry?: string;
  natIdIssueYear?: string;
  natIdIssueMonth?: string;
  natIdIssueDay?: string;
  natIdExpiryYear?: string;
  natIdExpiryMonth?: string;
  natIdExpiryDay?: string;
  hasUsCard: YesNo;
  usCardNumber?: string;
  usCardExpiryYear?: string;
  usCardExpiryMonth?: string;
  usCardExpiryDay?: string;
  passportNumber: string;
  passportCountry: string;
  passportIssueYear: string;
  passportIssueMonth: string;
  passportIssueDay: string;
  passportExpiryYear: string;
  passportExpiryMonth: string;
  passportExpiryDay: string;
  nativeLang: string;
  ableToCommunicate: "English" | "French" | "Both" | "Neither";
  preferredLang?: "English" | "French";
  langTest: YesNo;
  streetNum: string;
  streetName: string;
  city: string;
  country: string;
  provinceState: string;
  postalCode: string;
  sameAsMailing: YesNo;
  residential?: ResidentialAddress;
  aptUnit?: string;
  phone: string;
  phoneType: string;
  phoneCountryCode: string;
  schoolName: string;
  studyLevel: string;
  fieldOfStudy: string;
  schoolProvince: string;
  schoolCity: string;
  schoolAddress: string;
  dli: string;
  studentId?: string;
  studyFromYear: string;
  studyFromMonth: string;
  studyFromDay: string;
  studyToYear: string;
  studyToMonth: string;
  studyToDay: string;
  tuitionAmount: string;
  roomBoard?: string;
  otherStudyCosts?: string;
  availableFunds: string;
  funds: "Myself" | "Parents" | "Other";
  fundsOtherPerson?: string;
  caqNumber?: string;
  caqExpiryYear?: string;
  caqExpiryMonth?: string;
  caqExpiryDay?: string;
  palNumber?: string;
  palExpiryYear?: string;
  palExpiryMonth?: string;
  palExpiryDay?: string;
  educationIndicator: YesNo;
  educationRow?: EducationRow;
  jobs: JobRow[];
  bgTb: YesNo;
  bgDisorder: YesNo;
  bgMedicalDetails?: string;
  bgOverstay: YesNo;
  bgRefused: YesNo;
  bgClaimAsylum: YesNo;
  bgRefusedDetails?: string;
  bgCrime: YesNo;
  bgCrimeDetails?: string;
  bgMilitary: YesNo;
  bgMilitaryDetails?: string;
  bgViolence: YesNo;
  bgWitness: YesNo;
  cicContactConsent: YesNo;
  serviceIn?: "English" | "French";
};

/** Empty-user AESV2 file key for the shipped imm1294f.pdf (revision 4). */
const FILE_ENCRYPTION_KEY_F = hexToBytes(
  "813b737c96381da7a399b2160a659510",
);
const FILE_ENCRYPTION_KEY_E = hexToBytes(
  "876ab7974ce3a29b6d4aaccf68512f0c",
);

/** XFA datasets EmbeddedFile object numbers */
const DATASETS_OBJ_F = 113;
const DATASETS_OBJ_E = 114;
const DATASETS_GEN = 0;

export type Imm1294CryptoMeta = {
  fileKeyHex: string;
  datasetsObj: number;
  datasetsGen?: number;
};

function resolveCryptoMeta(
  blankPdf: Uint8Array,
  override?: Imm1294CryptoMeta,
): { fileKey: Uint8Array; datasetsObj: number; datasetsGen: number } {
  if (override?.fileKeyHex) {
    return {
      fileKey: hexToBytes(override.fileKeyHex),
      datasetsObj: override.datasetsObj,
      datasetsGen: override.datasetsGen ?? 0,
    };
  }
  // English blank is larger; French is the historical default in this function.
  if (blankPdf.byteLength >= 840_000) {
    return {
      fileKey: FILE_ENCRYPTION_KEY_E,
      datasetsObj: DATASETS_OBJ_E,
      datasetsGen: DATASETS_GEN,
    };
  }
  return {
    fileKey: FILE_ENCRYPTION_KEY_F,
    datasetsObj: DATASETS_OBJ_F,
    datasetsGen: DATASETS_GEN,
  };
}

const PROVINCE_LIC: Record<string, string> = {
  AB: "09",
  BC: "11",
  MB: "07",
  NB: "04",
  NL: "01",
  NS: "03",
  NT: "10",
  NU: "64",
  ON: "06",
  PE: "02",
  QC: "05",
  SK: "08",
  YT: "12",
};

const SERVICE_LIC: Record<string, string> = {
  English: "01",
  French: "02",
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strip accents / characters IRCC open-text validators often reject. */
function asciiSafe(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function openTag(tag: string, value: string): string {
  return `<${tag}\n>${esc(value)}</${tag}\n>`;
}

function fillEmpty(
  xml: string,
  tag: string,
  value: string,
  after = "",
): string {
  if (!value) return xml;
  const empty = `<${tag}\n/>`;
  const filled = openTag(tag, value);
  if (!after) return xml.replace(empty, filled);
  const idx = xml.indexOf(after);
  if (idx < 0) return xml;
  const head = xml.slice(0, idx);
  const tail = xml.slice(idx);
  const pos = tail.indexOf(empty);
  if (pos < 0) return xml;
  return head + tail.slice(0, pos) + filled + tail.slice(pos + empty.length);
}

function fillNested(
  xml: string,
  outer: string,
  value: string,
  after = "",
): string {
  if (!value) return xml;
  const empty = `<${outer}\n><${outer}\n/></${outer}\n>`;
  const filled = `<${outer}\n>${openTag(outer, value)}</${outer}\n>`;
  if (!after) return xml.replace(empty, filled);
  const idx = xml.indexOf(after);
  if (idx < 0) return xml;
  const head = xml.slice(0, idx);
  const tail = xml.slice(idx);
  const pos = tail.indexOf(empty);
  if (pos < 0) return xml;
  return head + tail.slice(0, pos) + filled + tail.slice(pos + empty.length);
}

function resolveProvinceLic(value: string): string {
  const raw = (value || "").trim().toUpperCase();
  if (!raw) return "";
  if (/^\d{2}$/.test(raw)) return raw;
  if (PROVINCE_LIC[raw]) return PROVINCE_LIC[raw];
  return raw;
}

function resolveCityLic(value: string): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  const { aliases, labels } = cityCodes as {
    aliases: Record<string, string>;
    labels: Record<string, string>;
  };
  const lower = raw.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  if (labels[raw]) return labels[raw];
  const stripped = lower.replace(/,\s*[a-z]{2}$/, "").trim();
  if (aliases[stripped]) return aliases[stripped];
  for (const [label, lic] of Object.entries(labels)) {
    if (label.toLowerCase() === lower && lic) return lic;
  }
  return asciiSafe(raw);
}

function phoneDigits(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function pad2(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  return raw ? raw.padStart(2, "0") : "";
}

function normalizeCorRow(row: CorRow): CorRow {
  return {
    country: resolveCountryLic(row.country),
    status: row.status ?? "",
    other: row.other ? asciiSafe(row.other) : undefined,
    fromYear: row.fromYear ?? "",
    fromMonth: pad2(row.fromMonth),
    fromDay: pad2(row.fromDay),
    toYear: row.toYear ?? "",
    toMonth: pad2(row.toMonth),
    toDay: pad2(row.toDay),
  };
}

function corRowXml(row: CorRow): string {
  const from = isoDate(row.fromYear, row.fromMonth, row.fromDay);
  const to = isoDate(row.toYear, row.toMonth, row.toDay);
  const other = row.other
    ? `<Other\n>${esc(row.other)}</Other\n>`
    : `<Other\n/>`;
  // Live IRCC blank uses <Country>, not the older <Pays> template name.
  return (
    `<Country\n>${esc(row.country)}</Country\n>` +
    `<Status\n>${esc(row.status)}</Status\n>` +
    other +
    (from ? `<FromDate\n>${esc(from)}</FromDate\n>` : `<FromDate\n/>`) +
    (to ? `<ToDate\n>${esc(to)}</ToDate\n>` : `<ToDate\n/>`)
  );
}

function datesXml(
  fromY: string,
  fromM: string,
  fromD: string,
  toY: string,
  toM: string,
  toD: string,
): string {
  return (
    `<FromYr\n>${esc(fromY)}</FromYr\n>` +
    `<FromMM\n>${esc(fromM)}</FromMM\n>` +
    `<FromDD\n>${esc(fromD)}</FromDD\n>` +
    `<ToYr\n>${esc(toY)}</ToYr\n>` +
    `<ToMM\n>${esc(toM)}</ToMM\n>` +
    `<ToDD\n>${esc(toD)}</ToDD\n>`
  );
}

function normalizeJob(job: JobRow): JobRow {
  const country = resolveCountryLic(job.country);
  let provinceState = job.provinceState
    ? asciiSafe(job.provinceState)
    : undefined;
  if (country === "511" && job.provinceState) {
    try {
      provinceState = resolveProvinceLic(job.provinceState);
    } catch {
      provinceState = asciiSafe(job.provinceState);
    }
  }
  const fromMonth = pad2(job.fromMonth);
  let toYear = job.toYear?.trim() || undefined;
  let toMonth = job.toMonth?.trim() ? job.toMonth.padStart(2, "0") : undefined;
  const toMonthNum = toMonth ? Number(toMonth) : NaN;
  // Valider rejects "00" and requires both To fields together (or neither).
  if (!toYear || !toMonth || toMonthNum < 1 || toMonthNum > 12) {
    toYear = undefined;
    toMonth = undefined;
  }
  return {
    fromYear: job.fromYear,
    fromMonth,
    toYear,
    toMonth,
    occupation: asciiSafe(job.occupation),
    employer: asciiSafe(job.employer),
    city: asciiSafe(job.city),
    country,
    provinceState,
  };
}

/** Map human form answers to IRCC LOV `lic` codes stored in XFA datasets. */
export function normalizeAnswers(a: Imm1294Answers): Imm1294Answers {
  const serviceIn = a.serviceIn === "French" ? "French" : "English";
  const preferredLang = a.preferredLang === "French" ? "French" : "English";
  const jobs = (a.jobs?.length ? a.jobs : []).map(normalizeJob);

  const previousCor = yn(a.previousCor, "N");
  const sameAsCor = yn(a.sameAsCor, "Y");
  const previouslyMarried = yn(a.previouslyMarried, "N");
  const educationIndicator = yn(a.educationIndicator, "N");
  const sameAsMailing = yn(a.sameAsMailing, "Y");
  const hasAlias = yn(a.hasAlias, "N");
  const hasNatId = yn(a.hasNatId, "N");
  const hasUsCard = yn(a.hasUsCard, "N");

  return {
    ...a,
    familyName: asciiSafe(a.familyName),
    givenName: asciiSafe(a.givenName),
    placeBirthCity: asciiSafe(a.placeBirthCity),
    placeBirthCountry: resolveCountryLic(a.placeBirthCountry),
    citizenship: resolveCountryLic(a.citizenship),
    spouseFamilyName: a.spouseFamilyName
      ? asciiSafe(a.spouseFamilyName)
      : undefined,
    spouseGivenName: a.spouseGivenName
      ? asciiSafe(a.spouseGivenName)
      : undefined,
    currentCountry: resolveCountryLic(a.currentCountry),
    corOther: a.corOther ? asciiSafe(a.corOther) : undefined,
    previousCor,
    previousCorRows: previousCor === "Y"
      ? (a.previousCorRows || []).slice(0, 2).map(normalizeCorRow)
      : [],
    sameAsCor,
    cwaRow: sameAsCor === "N" && a.cwaRow
      ? normalizeCorRow(a.cwaRow)
      : undefined,
    previouslyMarried,
    prevSpouse: previouslyMarried === "Y" && a.prevSpouse
      ? {
        ...a.prevSpouse,
        familyName: asciiSafe(a.prevSpouse.familyName),
        givenName: asciiSafe(a.prevSpouse.givenName),
        fromMonth: pad2(a.prevSpouse.fromMonth),
        fromDay: pad2(a.prevSpouse.fromDay),
        toMonth: pad2(a.prevSpouse.toMonth),
        toDay: pad2(a.prevSpouse.toDay),
        dobMonth: pad2(a.prevSpouse.dobMonth),
        dobDay: pad2(a.prevSpouse.dobDay),
      }
      : undefined,
    hasAlias,
    aliasFamilyName: hasAlias === "Y" && a.aliasFamilyName
      ? asciiSafe(a.aliasFamilyName)
      : undefined,
    aliasGivenName: hasAlias === "Y" && a.aliasGivenName
      ? asciiSafe(a.aliasGivenName)
      : undefined,
    hasNatId,
    natIdNumber: a.natIdNumber,
    natIdCountry: hasNatId === "Y" && a.natIdCountry
      ? resolveCountryLic(a.natIdCountry)
      : undefined,
    hasUsCard,
    passportCountry: resolveCountryLic(a.passportCountry),
    nativeLang: resolveLanguageLic(a.nativeLang),
    preferredLang,
    langTest: yn(a.langTest, "N"),
    streetName: asciiSafe(a.streetName),
    city: asciiSafe(a.city),
    country: resolveCountryLic(a.country),
    provinceState: asciiSafe(a.provinceState),
    sameAsMailing,
    aptUnit: a.aptUnit ? asciiSafe(a.aptUnit) : undefined,
    residential: sameAsMailing === "N" && a.residential
      ? {
        streetNum: a.residential.streetNum,
        streetName: asciiSafe(a.residential.streetName),
        city: asciiSafe(a.residential.city),
        country: resolveCountryLic(a.residential.country),
        provinceState: a.residential.provinceState
          ? asciiSafe(a.residential.provinceState)
          : undefined,
        postalCode: a.residential.postalCode,
        aptUnit: a.residential.aptUnit
          ? asciiSafe(a.residential.aptUnit)
          : undefined,
      }
      : undefined,
    phoneType: a.phoneType || "02",
    phoneCountryCode: (a.phoneCountryCode || "").replace(/\D/g, "") || "33",
    schoolName: asciiSafe(a.schoolName),
    studyLevel: a.studyLevel || "",
    fieldOfStudy: a.fieldOfStudy || "",
    schoolProvince: resolveProvinceLic(a.schoolProvince),
    schoolCity: resolveCityLic(a.schoolCity),
    schoolAddress: asciiSafe(a.schoolAddress),
    fundsOtherPerson: a.funds === "Other" && a.fundsOtherPerson
      ? asciiSafe(a.fundsOtherPerson)
      : undefined,
    educationIndicator,
    educationRow: educationIndicator === "Y" && a.educationRow
      ? {
        ...a.educationRow,
        fieldOfStudy: asciiSafe(a.educationRow.fieldOfStudy),
        school: asciiSafe(a.educationRow.school),
        city: asciiSafe(a.educationRow.city),
        country: resolveCountryLic(a.educationRow.country),
        fromMonth: pad2(a.educationRow.fromMonth),
        toMonth: pad2(a.educationRow.toMonth),
        provinceState: a.educationRow.provinceState
          ? asciiSafe(a.educationRow.provinceState)
          : undefined,
      }
      : undefined,
    jobs,
    bgTb: yn(a.bgTb, "N"),
    bgDisorder: yn(a.bgDisorder, "N"),
    bgMedicalDetails: a.bgMedicalDetails
      ? asciiSafe(a.bgMedicalDetails)
      : undefined,
    bgOverstay: yn(a.bgOverstay, "N"),
    bgRefused: yn(a.bgRefused, "N"),
    bgClaimAsylum: yn(a.bgClaimAsylum, "N"),
    bgRefusedDetails: a.bgRefusedDetails
      ? asciiSafe(a.bgRefusedDetails)
      : undefined,
    bgCrime: yn(a.bgCrime, "N"),
    bgCrimeDetails: a.bgCrimeDetails ? asciiSafe(a.bgCrimeDetails) : undefined,
    bgMilitary: yn(a.bgMilitary, "N"),
    bgMilitaryDetails: a.bgMilitaryDetails
      ? asciiSafe(a.bgMilitaryDetails)
      : undefined,
    bgViolence: yn(a.bgViolence, "N"),
    bgWitness: yn(a.bgWitness, "N"),
    cicContactConsent: yn(a.cicContactConsent, "N"),
    serviceIn,
  };
}

export function buildFilledForm1(template: string, a: Imm1294Answers): string {
  const serviceLic = SERVICE_LIC[a.serviceIn || "English"] || "01";
  const preferredLic = a.preferredLang === "French" ? "02" : "01";
  const issueDate = isoDate(
    a.passportIssueYear,
    a.passportIssueMonth,
    a.passportIssueDay,
  );
  const expiryDate = isoDate(
    a.passportExpiryYear,
    a.passportExpiryMonth,
    a.passportExpiryDay,
  );
  const studyFrom = isoDate(a.studyFromYear, a.studyFromMonth, a.studyFromDay);
  const studyTo = isoDate(a.studyToYear, a.studyToMonth, a.studyToDay);
  const intlPhone = phoneDigits(a.phone);
  const jobs = a.jobs?.length ? a.jobs : [];

  let xml = template;

  xml = fillNested(xml, "ServiceIn", serviceLic);
  xml = fillEmpty(xml, "UCIClientID", a.uci || "", "><VisaType");
  xml = fillEmpty(xml, "FamilyName", a.familyName, "><Name\n>");
  xml = fillEmpty(xml, "GivenName", a.givenName, "><Name\n>");
  xml = fillNested(xml, "AliasNameIndicator", a.hasAlias === "Y" ? "Y" : "N");
  if (a.hasAlias === "Y") {
    xml = fillEmpty(xml, "AliasFamilyName", a.aliasFamilyName || "", "><AliasName\n>");
    xml = fillEmpty(xml, "AliasGivenName", a.aliasGivenName || "", "><AliasName\n>");
  }
  xml = fillNested(xml, "Sex", a.sex);
  xml = fillEmpty(xml, "DOBYear", a.dobYear, "><Sex\n>");
  xml = fillEmpty(xml, "DOBMonth", a.dobMonth, "><Sex\n>");
  xml = fillEmpty(xml, "DOBDay", a.dobDay, "><Sex\n>");
  xml = fillEmpty(xml, "PlaceBirthCity", a.placeBirthCity);
  xml = fillEmpty(xml, "PlaceBirthCountry", a.placeBirthCountry);
  xml = fillNested(xml, "Citizenship", a.citizenship);
  xml = fillEmpty(xml, "Country", a.currentCountry, "><CurrentCOR\n>");
  xml = fillEmpty(xml, "Status", a.currentStatus, "><CurrentCOR\n>");
  if (a.corOther) {
    xml = fillEmpty(xml, "Other", a.corOther, "><CurrentCOR\n>");
  }
  if (a.corFromYear && a.corToYear) {
    const from = isoDate(a.corFromYear, a.corFromMonth || "", a.corFromDay || "");
    const to = ensureAfterToday(
      isoDate(a.corToYear, a.corToMonth || "", a.corToDay || ""),
    );
    const toParts = splitIsoDate(to);
    xml = fillEmpty(xml, "FromDate", from, "><CurrentCOR\n>");
    xml = fillEmpty(xml, "ToDate", to, "><CurrentCOR\n>");
    xml = xml.replace(
      /<CORDates\n><FromYr\n\/><FromMM\n\/><FromDD\n\/><ToYr\n\/><ToMM\n\/><ToDD\n\/>/,
      `<CORDates\n>${datesXml(
        a.corFromYear,
        a.corFromMonth || "",
        a.corFromDay || "",
        toParts.year || a.corToYear,
        toParts.month || a.corToMonth || "",
        toParts.day || a.corToDay || "",
      )}`,
    );
  }

  xml = fillEmpty(xml, "PCRIndicator", a.previousCor);
  if (a.previousCor === "Y" && a.previousCorRows?.length) {
    const r1 = a.previousCorRows[0];
    const r2 = a.previousCorRows[1];
    let prev =
      `<PreviousCOR\n><Row1 xfa:dataNode="dataGroup"\n/><Row2\n>${corRowXml(r1)}</Row2\n>`;
    if (r2) {
      prev += `<Row3\n>${corRowXml(r2)}</Row3\n></PreviousCOR\n>`;
      prev += `<PCRDatesR1\n>${
        datesXml(
          r1.fromYear,
          r1.fromMonth,
          r1.fromDay,
          r1.toYear,
          r1.toMonth,
          r1.toDay,
        )
      }</PCRDatesR1\n>`;
      prev += `<PCRDatesR2\n>${
        datesXml(
          r2.fromYear,
          r2.fromMonth,
          r2.fromDay,
          r2.toYear,
          r2.toMonth,
          r2.toDay,
        )
      }</PCRDatesR2\n>`;
    } else {
      prev +=
        `<Row3\n><Country\n/><Status\n/><Other\n/><FromDate\n/><ToDate\n/></Row3\n></PreviousCOR\n>`;
      prev += `<PCRDatesR1\n>${
        datesXml(
          r1.fromYear,
          r1.fromMonth,
          r1.fromDay,
          r1.toYear,
          r1.toMonth,
          r1.toDay,
        )
      }</PCRDatesR1\n>`;
      prev +=
        `<PCRDatesR2\n><FromYr\n/><FromMM\n/><FromDD\n/><ToYr\n/><ToMM\n/><ToDD\n/></PCRDatesR2\n>`;
    }
    xml = xml.replace(
      /<PreviousCOR\n>[\s\S]*?<\/PCRDatesR2\n>/,
      prev,
    );
  }

  xml = fillEmpty(xml, "SameAsCORIndicator", a.sameAsCor);
  if (a.sameAsCor === "N" && a.cwaRow) {
    const row = { ...a.cwaRow };
    const to = ensureAfterToday(isoDate(row.toYear, row.toMonth, row.toDay));
    const toParts = splitIsoDate(to);
    if (to) {
      row.toYear = toParts.year;
      row.toMonth = toParts.month;
      row.toDay = toParts.day;
    }
    const block =
      `<CountryWhereApplying\n><Row1 xfa:dataNode="dataGroup"\n/><Row2\n>${corRowXml(row)}</Row2\n></CountryWhereApplying\n>` +
      `<CWADates\n>${
        datesXml(
          row.fromYear,
          row.fromMonth,
          row.fromDay,
          row.toYear,
          row.toMonth,
          row.toDay,
        )
      }</CWADates\n>`;
    xml = xml.replace(
      /<CountryWhereApplying\n>[\s\S]*?<\/CWADates\n>/,
      block,
    );
  }

  xml = fillEmpty(
    xml,
    "MaritalStatus",
    a.maritalStatus,
    "><MaritalStatus\n><SectionA\n>",
  );
  if (a.maritalStatus === "01" || a.maritalStatus === "03") {
    const mDate = isoDate(
      a.marriageYear || "",
      a.marriageMonth || "",
      a.marriageDay || "",
    );
    xml = fillEmpty(xml, "DateOfMarriage", mDate, "><MaritalStatus\n><SectionA\n>");
    xml = fillEmpty(xml, "FamilyName", a.spouseFamilyName || "", "><MaritalStatus\n><SectionA\n>");
    xml = fillEmpty(xml, "GivenName", a.spouseGivenName || "", "><MaritalStatus\n><SectionA\n>");
    if (a.marriageYear) {
      xml = xml.replace(
        /<MarriageDate\n><FromYr\n\/><FromMM\n\/><FromDD\n\/>/,
        `<MarriageDate\n><FromYr\n>${esc(a.marriageYear)}</FromYr\n><FromMM\n>${
          esc(a.marriageMonth || "")
        }</FromMM\n><FromDD\n>${esc(a.marriageDay || "")}</FromDD\n>`,
      );
    }
  }

  xml = fillEmpty(xml, "PrevMarriedIndicator", a.previouslyMarried);
  if (a.previouslyMarried === "Y" && a.prevSpouse) {
    const p = a.prevSpouse;
    const from = isoDate(p.fromYear, p.fromMonth, p.fromDay);
    const to = isoDate(p.toYear, p.toMonth, p.toDay);
    xml = fillEmpty(xml, "PMFamilyName", p.familyName);
    xml = fillEmpty(xml, "PMGivenName", p.givenName);
    xml = fillEmpty(xml, "DOBYear", p.dobYear, "><PrevSpouseDOB\n>");
    xml = fillEmpty(xml, "DOBMonth", p.dobMonth, "><PrevSpouseDOB\n>");
    xml = fillEmpty(xml, "DOBDay", p.dobDay, "><PrevSpouseDOB\n>");
    xml = fillEmpty(xml, "TypeOfRelationship", p.relationshipType);
    xml = fillEmpty(xml, "FromDate", from, "><TypeOfRelationship\n>");
    xml = fillNested(xml, "ToDate", to);
    xml = xml.replace(
      /<PreviouslyMarriedDates\n><FromYr\n\/><FromMM\n\/><FromDD\n\/><ToYr\n\/><ToMM\n\/><ToDD\n\/>/,
      `<PreviouslyMarriedDates\n>${
        datesXml(
          p.fromYear,
          p.fromMonth,
          p.fromDay,
          p.toYear,
          p.toMonth,
          p.toDay,
        )
      }`,
    );
  }

  xml = fillEmpty(xml, "natIDIndicator", a.hasNatId === "Y" ? "Y" : "N", "><natID\n>");
  if (a.hasNatId === "Y") {
    xml = fillNested(xml, "DocNum", a.natIdNumber || "", "><natIDdocs\n>");
    xml = fillNested(xml, "CountryofIssue", a.natIdCountry || "", "><natIDdocs\n>");
    const nidIssue = isoDate(
      a.natIdIssueYear || "",
      a.natIdIssueMonth || "",
      a.natIdIssueDay || "",
    );
    const nidExp = isoDate(
      a.natIdExpiryYear || "",
      a.natIdExpiryMonth || "",
      a.natIdExpiryDay || "",
    );
    xml = fillNested(xml, "IssueDate", nidIssue, "><natIDdocs\n>");
    xml = fillEmpty(xml, "ExpiryDate", nidExp, "><natIDdocs\n>");
  }

  xml = fillEmpty(xml, "usCardIndicator", a.hasUsCard === "Y" ? "Y" : "N", "><USCard\n>");
  if (a.hasUsCard === "Y") {
    xml = fillNested(xml, "DocNum", a.usCardNumber || "", "><usCarddocs\n>");
    const usExp = isoDate(
      a.usCardExpiryYear || "",
      a.usCardExpiryMonth || "",
      a.usCardExpiryDay || "",
    );
    xml = fillEmpty(xml, "ExpiryDate", usExp, "><usCarddocs\n>");
  }

  xml = fillNested(xml, "nativeLang", a.nativeLang);
  xml = fillNested(xml, "ableToCommunicate", a.ableToCommunicate);
  if (a.ableToCommunicate === "Both") {
    xml = fillEmpty(xml, "lov", preferredLic, "><languages\n>");
  }
  // Live IRCC blank uses <LanguageTest>, not the older <LangTestIndicator> name.
  xml = fillEmpty(xml, "LanguageTest", a.langTest);

  xml = fillNested(xml, "PassportNum", a.passportNumber);
  xml = fillNested(xml, "CountryofIssue", a.passportCountry, "><Passport\n>");
  xml = fillNested(xml, "IssueDate", issueDate, "><Passport\n>");
  xml = fillEmpty(xml, "IssueYYYY", a.passportIssueYear);
  xml = fillEmpty(xml, "IssueMM", a.passportIssueMonth);
  xml = fillEmpty(xml, "IssueDD", a.passportIssueDay);
  xml = fillEmpty(xml, "ExpiryDate", expiryDate, "><Passport\n>");
  xml = fillEmpty(xml, "expiryYYYY", a.passportExpiryYear);
  xml = fillEmpty(xml, "expiryMM", a.passportExpiryMonth);
  xml = fillEmpty(xml, "expiryDD", a.passportExpiryDay);

  xml = fillNested(xml, "StreetNum", a.streetNum, "><AddressRow1\n>");
  xml = fillNested(xml, "Streetname", a.streetName, "><AddressRow1\n>");
  if (a.aptUnit) {
    xml = fillEmpty(xml, "AptUnit", a.aptUnit, "><AddressRow1\n>");
  }
  xml = fillEmpty(xml, "CityTown", a.city, "><CityTow\n>");
  xml = fillNested(xml, "Country", a.country, "><AddressRow2\n>");
  if (a.provinceState) {
    xml = fillNested(xml, "ProvinceState", a.provinceState, "><AddressRow2\n>");
  }
  xml = fillNested(xml, "PostalCode", a.postalCode, "><AddressRow2\n>");
  xml = fillEmpty(xml, "SameAsMailingIndicator", a.sameAsMailing);

  if (a.sameAsMailing === "N" && a.residential) {
    const r = a.residential;
    if (r.aptUnit) {
      xml = fillNested(xml, "AptUnit", r.aptUnit, "><ResidentialAddressRow1\n>");
    }
    xml = fillNested(xml, "StreetNum", r.streetNum, "><ResidentialAddressRow1\n>");
    // Residential uses <StreetName><Streetname/></StreetName> (not nested Streetname/Streetname).
    xml = fillEmpty(xml, "Streetname", r.streetName, "><ResidentialAddressRow1\n>");
    xml = fillNested(xml, "CityTown", r.city, "><ResidentialAddressRow1\n>");
    xml = fillNested(xml, "Country", r.country, "><ResidentialAddressRow2\n>");
    if (r.provinceState) {
      xml = fillNested(
        xml,
        "ProvinceState",
        r.provinceState,
        "><ResidentialAddressRow2\n>",
      );
    }
    xml = fillNested(xml, "PostalCode", r.postalCode, "><ResidentialAddressRow2\n>");
  }

  xml = xml.replace(
    "<Phone\n><Type\n/><CanadaUS\n>0</CanadaUS\n><Other\n>0</Other\n>",
    `<Phone\n><Type\n>${esc(a.phoneType)}</Type\n><CanadaUS\n>0</CanadaUS\n><Other\n>1</Other\n>`,
  );
  xml = fillEmpty(xml, "NumberCountry", a.phoneCountryCode, "><PhoneNumbers\n><Phone\n>");
  xml = fillNested(xml, "IntlNumber", intlPhone, "><PhoneNumbers\n><Phone\n>");
  xml = fillEmpty(xml, "ActualNumber", intlPhone, "><PhoneNumbers\n><Phone\n>");
  xml = fillEmpty(xml, "Email", a.email, "><FaxEmail\n>");

  xml = fillEmpty(xml, "SchoolName", a.schoolName, "><schoolName\n>");
  xml = fillEmpty(xml, "Level", a.studyLevel, "><schoolName\n>");
  xml = fillEmpty(xml, "Program", a.fieldOfStudy, "><schoolName\n>");
  xml = fillEmpty(xml, "StudentNo", a.studentId || "", "><DLI");
  xml = fillEmpty(xml, "Prov", a.schoolProvince, "><ProvinceState\n>");
  xml = fillNested(xml, "CityTown", a.schoolCity, "><PurposeRow1\n>");
  xml = fillNested(xml, "Address", a.schoolAddress, "><PurposeRow1\n>");
  xml = fillEmpty(xml, "DLI", a.dli, "><PurposeRow1\n>");
  xml = fillEmpty(xml, "FromDate", studyFrom, "><HowLongStudy\n>");
  xml = fillEmpty(xml, "ToDate", studyTo, "><HowLongStudy\n>");

  xml = fillEmpty(xml, "amount", a.tuitionAmount, "><tuition\n>");
  if (a.roomBoard) xml = fillEmpty(xml, "amount", a.roomBoard, "><roomBoard\n>");
  if (a.otherStudyCosts) xml = fillEmpty(xml, "amount", a.otherStudyCosts, "><other\n>");
  xml = fillNested(xml, "Funds", a.availableFunds, "><expensesPaid\n>");
  xml = fillEmpty(xml, "expensesPaidBy", a.funds, "><expensesPaid\n>");
  if (a.funds === "Other" && a.fundsOtherPerson) {
    xml = fillEmpty(xml, "Other", a.fundsOtherPerson, "><expensesPaid\n>");
  }
  if (a.caqNumber) {
    xml = fillEmpty(xml, "CertNum", a.caqNumber, "><CAQ\n>");
    if (a.caqExpiryYear) {
      xml = fillEmpty(
        xml,
        "CertExpiry",
        isoDate(a.caqExpiryYear, a.caqExpiryMonth || "", a.caqExpiryDay || ""),
        "><CAQ\n>",
      );
    }
  }
  if (a.palNumber) {
    xml = fillEmpty(xml, "DocNum", a.palNumber, "><PAL\n>");
    if (a.palExpiryYear) {
      xml = fillEmpty(
        xml,
        "DocExpiry",
        isoDate(a.palExpiryYear, a.palExpiryMonth || "", a.palExpiryDay || ""),
        "><PAL\n>",
      );
    }
  }

  xml = fillEmpty(xml, "EducationIndicator", a.educationIndicator);
  if (a.educationIndicator === "Y" && a.educationRow) {
    const e = a.educationRow;
    xml = fillEmpty(xml, "FromYear", e.fromYear, "><Edu_Row1\n>");
    xml = fillEmpty(xml, "FromMonth", e.fromMonth, "><Edu_Row1\n>");
    xml = fillEmpty(xml, "ToYear", e.toYear, "><Edu_Row1\n>");
    xml = fillEmpty(xml, "ToMonth", e.toMonth, "><Edu_Row1\n>");
    xml = fillEmpty(xml, "FieldOfStudy", e.fieldOfStudy, "><Edu_Row1\n>");
    xml = fillEmpty(xml, "School", e.school, "><Edu_Row1\n>");
    xml = fillEmpty(xml, "CityTown", e.city, "><Edu_Row1\n>");
    xml = fillNested(xml, "Country", e.country, "><Edu_Row1\n>");
    if (e.provinceState) {
      xml = fillEmpty(xml, "ProvState", e.provinceState, "><Edu_Row1\n>");
    }
  }

  const jobMarkers = [
    "><OccupationRow1\n>",
    "><OccupationRow2\n>",
    "><OccupationRow3\n>",
  ];
  jobs.slice(0, 3).forEach((job, i) => {
    const after = jobMarkers[i];
    xml = fillEmpty(xml, "FromYear", job.fromYear, after);
    xml = fillEmpty(xml, "FromMonth", job.fromMonth, after);
    if (job.toYear) xml = fillEmpty(xml, "ToYear", job.toYear, after);
    if (job.toMonth) xml = fillEmpty(xml, "ToMonth", job.toMonth, after);
    xml = fillNested(xml, "Occupation", job.occupation, after);
    xml = fillEmpty(xml, "Employer", job.employer, after);
    xml = fillNested(xml, "CityTown", job.city, after);
    xml = fillNested(xml, "Country", job.country, after);
    if (job.provinceState) {
      xml = fillEmpty(xml, "ProvState", job.provinceState, after);
    }
  });

  xml = xml.replace(
    /<BackgroundInfo\n><Choice\n\/><Choice\n\/>/,
    `<BackgroundInfo\n><Choice\n>${a.bgTb}</Choice\n><Choice\n>${a.bgDisorder}</Choice\n>`,
  );
  if ((a.bgTb === "Y" || a.bgDisorder === "Y") && a.bgMedicalDetails) {
    xml = fillEmpty(xml, "MedicalDetails", a.bgMedicalDetails);
  }
  xml = fillEmpty(xml, "VisaChoice1", a.bgOverstay);
  xml = fillEmpty(xml, "VisaChoice2", a.bgRefused);
  xml = fillEmpty(xml, "VisaChoice3", a.bgClaimAsylum);
  if (
    (a.bgOverstay === "Y" || a.bgRefused === "Y" || a.bgClaimAsylum === "Y") &&
    a.bgRefusedDetails
  ) {
    xml = fillEmpty(xml, "refusedDetails", a.bgRefusedDetails);
  }
  xml = xml.replace(
    /<BackgroundInfo3\n><Choice\n\/>/,
    `<BackgroundInfo3\n><Choice\n>${a.bgCrime}</Choice\n>`,
  );
  if (a.bgCrime === "Y" && a.bgCrimeDetails) {
    xml = fillEmpty(xml, "Details", a.bgCrimeDetails, "><BackgroundInfo3\n>");
  }
  xml = xml.replace(
    /<Military\n><Choice\n\/>/,
    `<Military\n><Choice\n>${a.bgMilitary}</Choice\n>`,
  );
  if (a.bgMilitary === "Y" && a.bgMilitaryDetails) {
    xml = fillEmpty(xml, "militaryServiceDetails", a.bgMilitaryDetails);
  }
  xml = xml.replace(
    /<Occupation\n><Choice\n\/>/,
    `<Occupation\n><Choice\n>${a.bgViolence}</Choice\n>`,
  );
  xml = xml.replace(
    /<GovPosition\n><Choice\n\/>/,
    `<GovPosition\n><Choice\n>${a.bgWitness}</Choice\n>`,
  );
  xml = xml.replace(
    /<Consent0\n><Choice\n\/>/,
    `<Consent0\n><Choice\n>${a.cicContactConsent}</Choice\n>`,
  );

  return xml;
}

function indexOfBytes(
  haystack: Uint8Array,
  needle: Uint8Array | string,
  from = 0,
): number {
  const n = typeof needle === "string"
    ? new TextEncoder().encode(needle)
    : needle;
  outer: for (let i = from; i <= haystack.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) {
      if (haystack[i + j] !== n[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function objectKey(fileKey: Uint8Array, idnum: number, gen: number): Uint8Array {
  const keyData = new Uint8Array(fileKey.length + 3 + 2 + 4);
  keyData.set(fileKey, 0);
  keyData[fileKey.length] = idnum & 0xff;
  keyData[fileKey.length + 1] = (idnum >> 8) & 0xff;
  keyData[fileKey.length + 2] = (idnum >> 16) & 0xff;
  keyData[fileKey.length + 3] = gen & 0xff;
  keyData[fileKey.length + 4] = (gen >> 8) & 0xff;
  keyData.set(new TextEncoder().encode("sAlT"), fileKey.length + 5);
  const digest = md5.arrayBuffer(keyData) as ArrayBuffer;
  const full = new Uint8Array(digest);
  const len = Math.min(16, fileKey.length + 5);
  return full.subarray(0, len);
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function aesEncryptCbc(
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(key),
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      asBufferSource(plaintext),
    ),
  );
  const out = new Uint8Array(16 + cipher.length);
  out.set(iv, 0);
  out.set(cipher, 16);
  return out;
}

async function aesDecryptCbc(
  key: Uint8Array,
  payload: Uint8Array,
): Promise<Uint8Array> {
  const iv = payload.subarray(0, 16);
  const cipher = payload.subarray(16);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(key),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: asBufferSource(iv) },
      cryptoKey,
      asBufferSource(cipher),
    ),
  );
}

function findStreamSpan(
  pdf: Uint8Array,
  objNum: number,
): { dictStart: number; streamStart: number; streamEnd: number; endobj: number } {
  const header = new TextEncoder().encode(`${objNum} 0 obj`);
  // Prefer the last occurrence (incremental updates append a replacement object).
  // Require a non-digit before the object number so "8 0 obj" ≠ match inside "18 0 obj".
  let dictStart = -1;
  let from = 0;
  while (true) {
    const idx = indexOfBytes(pdf, header, from);
    if (idx < 0) break;
    const prev = idx > 0 ? pdf[idx - 1] : 0;
    if (prev < 0x30 || prev > 0x39) {
      dictStart = idx;
    }
    from = idx + header.length;
  }
  if (dictStart < 0) throw new Error(`PDF object ${objNum} not found`);

  const streamKw = indexOfBytes(pdf, "stream", dictStart);
  if (streamKw < 0) throw new Error(`stream keyword missing for obj ${objNum}`);

  // After "stream", skip EOL (\r\n, \n, or \r)
  let streamStart = streamKw + 6;
  if (pdf[streamStart] === 0x0d && pdf[streamStart + 1] === 0x0a) {
    streamStart += 2;
  } else if (pdf[streamStart] === 0x0a || pdf[streamStart] === 0x0d) {
    streamStart += 1;
  }

  const endstream = indexOfBytes(pdf, "endstream", streamStart);
  if (endstream < 0) throw new Error("endstream missing");
  let streamEnd = endstream;
  // Trim trailing EOL before endstream
  if (pdf[streamEnd - 1] === 0x0a) streamEnd -= 1;
  if (pdf[streamEnd - 1] === 0x0d) streamEnd -= 1;

  const endobj = indexOfBytes(pdf, "endobj", endstream);
  if (endobj < 0) throw new Error("endobj missing");

  return { dictStart, streamStart, streamEnd, endobj: endobj + 6 };
}

function parseLastStartXref(pdf: Uint8Array): number {
  // Only scan the file tail — encrypted streams can contain false "startxref" bytes.
  const tailStart = Math.max(0, pdf.length - 4096);
  const text = new TextDecoder("latin1").decode(pdf.subarray(tailStart));
  const matches = [...text.matchAll(/startxref\s+(\d+)/g)];
  if (!matches.length) throw new Error("startxref not found");
  return Number(matches[matches.length - 1][1]);
}

function parseTrailerMeta(pdf: Uint8Array): {
  size: number;
  root: string;
  info: string;
  encrypt: string;
  id: string;
} {
  // Prefer values from the last XRef stream dictionary near EOF.
  const tail = new TextDecoder("latin1").decode(pdf.slice(-1200));
  const size = Number(/\/Size\s+(\d+)/.exec(tail)?.[1]);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(tail)?.[1];
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(tail)?.[1];
  const encrypt = /\/Encrypt\s+(\d+\s+\d+\s+R)/.exec(tail)?.[1];
  // Keep IRCC's compact /ID[<a><b>] form (no spaces) — Acrobat is picky after repairs.
  const id = /\/ID\s*(\[[^\]]+\])/.exec(tail)?.[1]?.replace(/\s+/g, "");
  if (!size || !root || !info || !encrypt || !id) {
    throw new Error("Could not parse PDF trailer metadata");
  }
  return { size, root, info, encrypt, id };
}

function be3(n: number): Uint8Array {
  return new Uint8Array([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}

/** Decrypt and inflate the XFA datasets XML (latest incremental revision). */
export async function extractDatasetsXml(
  pdf: Uint8Array,
  crypto?: Imm1294CryptoMeta,
): Promise<string> {
  const { fileKey, datasetsObj, datasetsGen } = resolveCryptoMeta(pdf, crypto);
  const span = findStreamSpan(pdf, datasetsObj);
  const encrypted = pdf.subarray(span.streamStart, span.streamEnd);
  const okey = objectKey(fileKey, datasetsObj, datasetsGen);
  const compressed = await aesDecryptCbc(okey, encrypted);
  const xmlBytes = inflate(compressed);
  return new TextDecoder("utf-8").decode(xmlBytes);
}

function patchForm1(datasetsXml: string, answers: Imm1294Answers): string {
  const start = datasetsXml.indexOf("<form1");
  if (start < 0) throw new Error("form1 missing in XFA datasets");
  const endMatch = datasetsXml.slice(start).match(/<\/form1\n?>/);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error("form1 close tag missing");
  }
  const end = start + endMatch.index + endMatch[0].length;
  const filled = buildFilledForm1(datasetsXml.slice(start, end), answers);
  return datasetsXml.slice(0, start) + filled + datasetsXml.slice(end);
}

/**
 * Fill the certified IMM 1294 PDF via encrypted incremental update.
 * `blankPdf` must be the original IRCC file (imm1294f.pdf), not a rewritten blank.
 *
 * Appends a replacement datasets object plus an /XRef stream. Important: IRCC's
 * own XRef streams are stored *unencrypted* (raw Flate) even though the file uses
 * AESV2 for EmbeddedFile streams. Encrypting the XRef stream makes Acrobat fail
 * to parse it, "repair" the PDF, and report an invalid signature byte range.
 */
export async function fillImm1294Pdf(
  blankPdf: Uint8Array,
  answers: Imm1294Answers,
  crypto?: Imm1294CryptoMeta,
): Promise<Uint8Array> {
  const { fileKey, datasetsObj, datasetsGen } = resolveCryptoMeta(blankPdf, crypto);
  const normalized = normalizeAnswers(answers);
  const datasetsXml = await extractDatasetsXml(blankPdf, crypto);
  const patchedXml = patchForm1(datasetsXml, normalized);
  const xmlBytes = new TextEncoder().encode(patchedXml);
  const compressed = deflate(xmlBytes);
  const okey = objectKey(fileKey, datasetsObj, datasetsGen);
  const streamBytes = await aesEncryptCbc(okey, compressed);

  const prev = parseLastStartXref(blankPdf);
  const meta = parseTrailerMeta(blankPdf);
  const objOffset = blankPdf.length;

  // Match IRCC's compact EmbeddedFile dict style (single-line, padded Length).
  const lengthField = String(streamBytes.length).padStart(10, " ");
  const header = new TextEncoder().encode(
    `${datasetsObj} 0 obj\n` +
      `<</Filter[/FlateDecode]/Length${lengthField}/Type/EmbeddedFile>>stream\n`,
  );
  const footer = new TextEncoder().encode("\nendstream\nendobj\n");
  const objBody = new Uint8Array(header.length + streamBytes.length + footer.length);
  objBody.set(header, 0);
  objBody.set(streamBytes, header.length);
  objBody.set(footer, header.length + streamBytes.length);

  // Next free object number becomes the XRef stream (Size was max+1).
  const xrefObjNum = meta.size;
  const xrefOffset = objOffset + objBody.length;

  // W[1 3 1]: type(1=in-use) + 3-byte offset + 1-byte generation
  const xrefBin = new Uint8Array(5);
  xrefBin[0] = 1;
  xrefBin.set(be3(objOffset), 1);
  xrefBin[4] = 0;

  // PNG predictor 12 (Up), Columns=5 — same as IRCC obj 125.
  // Row = predictor_byte(2=Up) + 5 bytes; first row Up-from-zeros = identity.
  const predicted = new Uint8Array(6);
  predicted[0] = 2;
  predicted.set(xrefBin, 1);
  const xrefFlate = deflate(predicted);
  // Intentionally NOT AES-encrypted — matches IRCC XRef streams.
  const xrefLenField = String(xrefFlate.length).padStart(7, " ");

  const xrefHeader = new TextEncoder().encode(
    `${xrefObjNum} 0 obj\n` +
      `<</Length${xrefLenField}/Type/XRef/Root ${meta.root}/Info ${meta.info}` +
      `/Encrypt ${meta.encrypt}/ID${meta.id}/Size ${meta.size + 1}` +
      `/Prev ${prev}/Index[${datasetsObj} 1]/W[1 3 1]` +
      `/DecodeParms<</Columns 5/Predictor 12>>/Filter/FlateDecode>>` +
      `stream\n`,
  );
  const xrefFooter = new TextEncoder().encode("\nendstream\nendobj\n");
  const xrefBody = new Uint8Array(
    xrefHeader.length + xrefFlate.length + xrefFooter.length,
  );
  xrefBody.set(xrefHeader, 0);
  xrefBody.set(xrefFlate, xrefHeader.length);
  xrefBody.set(xrefFooter, xrefHeader.length + xrefFlate.length);

  const tail = new TextEncoder().encode(
    `startxref\n${xrefOffset}\n%%EOF\n`,
  );

  const out = new Uint8Array(
    blankPdf.length + objBody.length + xrefBody.length + tail.length,
  );
  out.set(blankPdf, 0);
  out.set(objBody, blankPdf.length);
  out.set(xrefBody, blankPdf.length + objBody.length);
  out.set(tail, blankPdf.length + objBody.length + xrefBody.length);

  // Sanity: original prefix (incl. IRCC signature) unchanged
  for (let i = 0; i < blankPdf.length; i++) {
    if (out[i] !== blankPdf[i]) throw new Error("Incremental prefix corrupted");
  }
  // startxref must point at the XRef stream object we just wrote
  const marked = new TextDecoder("latin1").decode(out.subarray(xrefOffset, xrefOffset + 12));
  if (!marked.startsWith(`${xrefObjNum} 0 obj`)) {
    throw new Error(`startxref mismatch: expected obj ${xrefObjNum} at ${xrefOffset}`);
  }
  // XRef stream must look like raw zlib (IRCC style), not AES
  const streamKw = indexOfBytes(out, "stream\n", xrefOffset);
  const sig = out.subarray(streamKw + 7, streamKw + 9);
  if (sig[0] !== 0x78) {
    throw new Error("XRef stream is not raw Flate (Acrobat requires unencrypted XRef)");
  }

  return out;
}

/** @deprecated kept for diagnostics */
export function debugFileKeyHex(): string {
  return bytesToHex(FILE_ENCRYPTION_KEY_F);
}
