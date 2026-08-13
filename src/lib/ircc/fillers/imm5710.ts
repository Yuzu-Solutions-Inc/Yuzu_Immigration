/**
 * Fill IMM 5710 — application to change conditions / extend stay (work permit inside Canada).
 */
import { resolveCountryLic, resolveLanguageLic } from "../codes/resolve-lic";
import {
  type CorRow,
  type EducationRow,
  type JobRow,
  type PrevSpouse,
  type YesNo,
  isoDate,
  yn,
} from "./imm1294-branches";
import formMeta from "../form-meta.json";
import { fillXfaDatasetsIncremental, type FormMeta } from "../xfa-incremental";

const PROVINCE_LIC: Record<string, string> = {
  AB: "09", BC: "11", MB: "07", NB: "04", NL: "01", NS: "03", NT: "10", NU: "64",
  ON: "06", PE: "02", QC: "05", SK: "08", YT: "12",
};

export type Imm5710Answers = {
  email: string;
  familyName: string;
  givenName: string;
  sex: "Male" | "Female" | "Unknown" | "Unspecified";
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  placeBirthCity: string;
  placeBirthCountry: string;
  citizenship: string;
  maritalStatus: string;
  spouseFamilyName?: string;
  spouseGivenName?: string;
  marriageYear?: string;
  marriageMonth?: string;
  marriageDay?: string;
  currentCountry: string;
  currentStatus: string;
  corOther?: string;
  corFromYear?: string;
  corFromMonth?: string;
  corFromDay?: string;
  corToYear?: string;
  corToMonth?: string;
  corToDay?: string;
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
  aptUnit?: string;
  phone: string;
  phoneType: string;
  phoneCountryCode: string;
  serviceIn?: "English" | "French";
  applyingRestore?: boolean;
  applyingExtend?: boolean;
  applyingNewEmployer?: boolean;
  applyingTrp?: boolean;
  origEntryDate?: string;
  origEntryPlace?: string;
  purposeOfVisit?: string;
  purposeOther?: string;
  recentEntryDate?: string;
  recentEntryPlace?: string;
  prevDocNum?: string;
  workPurposeType?: string;
  workPurposeOther?: string;
  employerName: string;
  employerAddress: string;
  workProvince: string;
  workCity: string;
  workLocationAddress?: string;
  jobTitle: string;
  jobDescription: string;
  workFromYear: string;
  workFromMonth: string;
  workFromDay: string;
  workToYear: string;
  workToMonth: string;
  workToDay: string;
  lmiaNumber?: string;
  caqNumber?: string;
  caqExpiryYear?: string;
  caqExpiryMonth?: string;
  caqExpiryDay?: string;
  provNominee?: string;
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
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function asciiSafe(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7E]/g, "");
}

function openTag(tag: string, value: string): string {
  return `<${tag}\n>${esc(value)}</${tag}\n>`;
}

function fillEmpty(xml: string, tag: string, value: string, after = ""): string {
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

function fillNested(xml: string, outer: string, value: string, after = ""): string {
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
  const raw = value.trim().toUpperCase();
  if (/^\d{2}$/.test(raw)) return raw;
  if (PROVINCE_LIC[raw]) return PROVINCE_LIC[raw];
  return asciiSafe(value);
}

function corRowXml(row: CorRow): string {
  const from = isoDate(row.fromYear, row.fromMonth, row.fromDay);
  const to = isoDate(row.toYear, row.toMonth, row.toDay);
  const other = row.other ? `<Other\n>${esc(row.other)}</Other\n>` : `<Other\n/>`;
  return (
    `<Country\n>${esc(row.country)}</Country\n>` +
    `<Status\n>${esc(row.status)}</Status\n>` + other +
    `<FromDate\n>${esc(from)}</FromDate\n><ToDate\n>${esc(to)}</ToDate\n>`
  );
}

function datesXml(
  fromY: string, fromM: string, fromD: string,
  toY: string, toM: string, toD: string,
): string {
  return (
    `<FromYr\n>${esc(fromY)}</FromYr\n><FromMM\n>${esc(fromM)}</FromMM\n><FromDD\n>${esc(fromD)}</FromDD\n>` +
    `<ToYr\n>${esc(toY)}</ToYr\n><ToMM\n>${esc(toM)}</ToMM\n><ToDD\n>${esc(toD)}</ToDD\n>`
  );
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeJob(job: JobRow): JobRow {
  const country = resolveCountryLic(job.country);
  let provinceState = job.provinceState ? asciiSafe(job.provinceState) : undefined;
  if (country === "511" && job.provinceState) {
    try { provinceState = resolveProvinceLic(job.provinceState); } catch { /* keep text */ }
  }
  let toYear = job.toYear?.trim() || undefined;
  let toMonth = job.toMonth?.trim() ? job.toMonth.padStart(2, "0") : undefined;
  if (!toYear || !toMonth || Number(toMonth) < 1 || Number(toMonth) > 12) {
    toYear = undefined;
    toMonth = undefined;
  }
  return {
    fromYear: job.fromYear,
    fromMonth: job.fromMonth.padStart(2, "0"),
    toYear,
    toMonth,
    occupation: asciiSafe(job.occupation),
    employer: asciiSafe(job.employer),
    city: asciiSafe(job.city),
    country,
    provinceState,
  };
}

export function normalize5710Answers(a: Imm5710Answers): Imm5710Answers {
  const jobs = (a.jobs?.length ? a.jobs : [{
    fromYear: "2022", fromMonth: "09", occupation: a.jobTitle || "Worker",
    employer: a.employerName, city: a.workCity || a.city, country: "511",
  }]).map(normalizeJob);

  return {
    ...a,
    familyName: asciiSafe(a.familyName),
    givenName: asciiSafe(a.givenName),
    placeBirthCity: asciiSafe(a.placeBirthCity),
    placeBirthCountry: resolveCountryLic(a.placeBirthCountry),
    citizenship: resolveCountryLic(a.citizenship),
    currentCountry: a.currentCountry ? resolveCountryLic(a.currentCountry) : "511",
    country: resolveCountryLic(a.country || "Canada"),
    previousCor: yn(a.previousCor, "N"),
    sameAsCor: yn(a.sameAsCor, "Y"),
    previouslyMarried: yn(a.previouslyMarried, "N"),
    hasAlias: yn(a.hasAlias, "N"),
    hasNatId: yn(a.hasNatId, "N"),
    hasUsCard: yn(a.hasUsCard, "N"),
    passportCountry: resolveCountryLic(a.passportCountry),
    nativeLang: resolveLanguageLic(a.nativeLang),
    langTest: yn(a.langTest, "N"),
    streetName: asciiSafe(a.streetName),
    city: asciiSafe(a.city),
    provinceState: resolveProvinceLic(a.provinceState),
    workProvince: resolveProvinceLic(a.workProvince),
    employerName: asciiSafe(a.employerName),
    employerAddress: asciiSafe(a.employerAddress),
    workCity: asciiSafe(a.workCity),
    jobTitle: asciiSafe(a.jobTitle),
    jobDescription: asciiSafe(a.jobDescription),
    educationIndicator: yn(a.educationIndicator, "N"),
    jobs,
    bgTb: yn(a.bgTb, "N"),
    bgDisorder: yn(a.bgDisorder, "N"),
    bgOverstay: yn(a.bgOverstay, "N"),
    bgRefused: yn(a.bgRefused, "N"),
    bgClaimAsylum: yn(a.bgClaimAsylum, "N"),
    bgCrime: yn(a.bgCrime, "N"),
    bgMilitary: yn(a.bgMilitary, "N"),
    bgViolence: yn(a.bgViolence, "N"),
    bgWitness: yn(a.bgWitness, "N"),
    cicContactConsent: yn(a.cicContactConsent, "N"),
    serviceIn: a.serviceIn === "French" ? "French" : "English",
  };
}

export function buildFilledForm5710(template: string, raw: Imm5710Answers): string {
  const a = normalize5710Answers(raw);
  const serviceLic = a.serviceIn === "French" ? "02" : "01";
  const preferredLic = a.preferredLang === "French" ? "02" : "01";
  const jobs = a.jobs.slice(0, 3);
  let xml = template;

  xml = fillNested(xml, "ServiceIn", serviceLic, "><ServiceIn\n>");
  xml = fillEmpty(xml, "FamilyName", a.familyName, "><Name\n>");
  xml = fillEmpty(xml, "GivenName", a.givenName, "><Name\n>");

  xml = xml.replace(
    /<ApplyingFor\n>[\s\S]*?<\/ApplyingFor\n>/,
    `<ApplyingFor\n><RestoreStat\n>${a.applyingRestore ? "1" : "0"}</RestoreStat\n>` +
      `<Extend\n>${a.applyingExtend ? "1" : "0"}</Extend\n>` +
      `<NewEmployer\n>${a.applyingNewEmployer ? "1" : "0"}</NewEmployer\n>` +
      `<TRP\n>${a.applyingTrp ? "1" : "0"}</TRP\n></ApplyingFor\n>`,
  );

  xml = fillNested(xml, "AliasNameIndicator", a.hasAlias === "Y" ? "Y" : "N");
  if (a.hasAlias === "Y") {
    xml = fillEmpty(xml, "AliasFamilyName", a.aliasFamilyName || "");
    xml = fillEmpty(xml, "AliasGivenName", a.aliasGivenName || "");
  }
  // Structure is <sex><Sex/></sex> — not nested Sex/Sex.
  xml = fillEmpty(xml, "Sex", a.sex, "><sex\n>");
  xml = fillEmpty(xml, "DOBYear", a.dobYear, "><dob\n>");
  xml = fillEmpty(xml, "DOBMonth", a.dobMonth, "><dob\n>");
  xml = fillEmpty(xml, "DOBDay", a.dobDay, "><dob\n>");
  xml = fillEmpty(xml, "PlaceBirthCity", a.placeBirthCity, "><pob\n>");
  xml = fillEmpty(xml, "PlaceBirthCountry", a.placeBirthCountry, "><pob\n>");
  xml = fillNested(xml, "Citizenship", a.citizenship);

  xml = fillEmpty(xml, "Country", a.currentCountry || "511", "><CurrentCOR\n><Row2\n>");
  xml = fillEmpty(xml, "Status", a.currentStatus, "><CurrentCOR\n><Row2\n>");
  if (a.corOther) xml = fillEmpty(xml, "Other", a.corOther, "><CurrentCOR\n><Row2\n>");
  if (a.corFromYear && a.corToYear) {
    const from = isoDate(a.corFromYear, a.corFromMonth || "01", a.corFromDay || "01");
    const to = isoDate(a.corToYear, a.corToMonth || "01", a.corToDay || "01");
    xml = fillEmpty(xml, "FromDate", from, "><CurrentCOR\n><Row2\n>");
    xml = fillEmpty(xml, "ToDate", to, "><CurrentCOR\n><Row2\n>");
    xml = xml.replace(
      /<CORDates\n><FromYr\n\/><FromMM\n\/><FromDD\n\/><ToDD\n\/><ToYr\n\/><ToMM\n\/>/,
      `<CORDates\n><FromYr\n>${esc(a.corFromYear)}</FromYr\n><FromMM\n>${esc(a.corFromMonth || "01")}</FromMM\n>` +
        `<FromDD\n>${esc(a.corFromDay || "01")}</FromDD\n><ToDD\n>${esc(a.corToDay || "01")}</ToDD\n>` +
        `<ToYr\n>${esc(a.corToYear)}</ToYr\n><ToMM\n>${esc(a.corToMonth || "01")}</ToMM\n>`,
    );
  }

  xml = fillEmpty(xml, "PCRIndicator", a.previousCor);
  if (a.previousCor === "Y" && a.previousCorRows?.length) {
    const r1 = a.previousCorRows[0];
    const r2 = a.previousCorRows[1];
    let prev = `<PreviousCOR\n><Row1 xfa:dataNode="dataGroup"\n/><Row2\n>${corRowXml(r1)}</Row2\n>`;
    if (r2) {
      prev += `<Row3\n>${corRowXml(r2)}</Row3\n></PreviousCOR\n>`;
      prev += `<PCRDatesR1\n>${datesXml(r1.fromYear, r1.fromMonth, r1.fromDay, r1.toYear, r1.toMonth, r1.toDay)}</PCRDatesR1\n>`;
      prev += `<PCRDatesR2\n>${datesXml(r2.fromYear, r2.fromMonth, r2.fromDay, r2.toYear, r2.toMonth, r2.toDay)}</PCRDatesR2\n>`;
    } else {
      prev += `<Row3\n><Country\n/><Status\n/><Other\n/><FromDate\n/><ToDate\n/></Row3\n></PreviousCOR\n>`;
      prev += `<PCRDatesR1\n>${datesXml(r1.fromYear, r1.fromMonth, r1.fromDay, r1.toYear, r1.toMonth, r1.toDay)}</PCRDatesR1\n>`;
      prev += `<PCRDatesR2\n><FromYr\n/><FromMM\n/><FromDD\n/><ToYr\n/><ToMM\n/><ToDD\n/></PCRDatesR2\n>`;
    }
    xml = xml.replace(/<PreviousCOR\n>[\s\S]*?<\/PCRDatesR2\n>/, prev);
  }

  xml = fillEmpty(xml, "MaritalStatus", a.maritalStatus, "><Current\n>");
  if (a.maritalStatus === "01" || a.maritalStatus === "03") {
    xml = fillEmpty(xml, "FamilyName", a.spouseFamilyName || "", "><c\n>");
    xml = fillEmpty(xml, "GivenName", a.spouseGivenName || "", "><c\n>");
    if (a.marriageYear) {
      xml = xml.replace(
        /<MarriageDate\n><FromYr\n\/><FromMM\n\/><FromDD\n\/>/,
        `<MarriageDate\n><FromYr\n>${esc(a.marriageYear)}</FromYr\n><FromMM\n>${esc(a.marriageMonth || "01")}</FromMM\n><FromDD\n>${esc(a.marriageDay || "01")}</FromDD\n>`,
      );
    }
  }

  xml = fillEmpty(xml, "PrevMarriedIndicator", a.previouslyMarried);
  if (a.previouslyMarried === "Y" && a.prevSpouse) {
    const p = a.prevSpouse;
    xml = fillEmpty(xml, "PMFamilyName", p.familyName);
    xml = fillEmpty(xml, "PMGivenName", p.givenName);
    xml = fillEmpty(xml, "TypeOfRelationship", p.relationshipType);
    xml = fillEmpty(xml, "FromDate", isoDate(p.fromYear, p.fromMonth, p.fromDay), "><From\n>");
    xml = fillEmpty(xml, "ToDate", isoDate(p.toYear, p.toMonth, p.toDay), "><To\n>");
    xml = xml.replace(
      /<PreviouslyMarriedDates\n><FromYr\n\/><FromMM\n\/><FromDD\n\/><ToYr\n\/><ToMM\n\/><ToDD\n\/>/,
      `<PreviouslyMarriedDates\n>${datesXml(p.fromYear, p.fromMonth, p.fromDay, p.toYear, p.toMonth, p.toDay)}`,
    );
    xml = fillEmpty(xml, "DOBYear", p.dobYear, "><dob\n>");
    xml = fillEmpty(xml, "DOBMonth", p.dobMonth, "><dob\n>");
    xml = fillEmpty(xml, "DOBDay", p.dobDay, "><dob\n>");
  }

  xml = fillEmpty(xml, "nativeLang", a.nativeLang, "><Languages\n>");
  xml = fillEmpty(xml, "communicateLang", a.ableToCommunicate, "><Languages\n>");
  xml = fillEmpty(xml, "LangTestIndicator", a.langTest, "><Languages\n>");
  if (a.ableToCommunicate === "Both") {
    xml = fillEmpty(xml, "FreqLang", preferredLic, "><Languages\n>");
  }

  xml = fillEmpty(xml, "PassportNum", a.passportNumber, "><Passport\n>");
  xml = fillEmpty(xml, "CountryofIssue", a.passportCountry, "><Passport\n>");
  xml = fillEmpty(
    xml,
    "IssueDate",
    isoDate(a.passportIssueYear, a.passportIssueMonth, a.passportIssueDay),
    "><Passport\n>",
  );
  xml = fillEmpty(
    xml,
    "ExpiryDate",
    isoDate(a.passportExpiryYear, a.passportExpiryMonth, a.passportExpiryDay),
    "><Passport\n>",
  );
  xml = fillEmpty(xml, "YYYY", a.passportIssueYear, "><Issue\n>");
  xml = fillEmpty(xml, "MM", a.passportIssueMonth, "><Issue\n>");
  xml = fillEmpty(xml, "DD", a.passportIssueDay, "><Issue\n>");
  xml = fillEmpty(xml, "YYYY", a.passportExpiryYear, "><Expiry\n>");
  xml = fillEmpty(xml, "MM", a.passportExpiryMonth, "><Expiry\n>");
  xml = fillEmpty(xml, "DD", a.passportExpiryDay, "><Expiry\n>");
  xml = fillEmpty(xml, "TaiwanPIN", "N", "><Passport\n>");
  xml = fillEmpty(xml, "IsraelPassportIndicator", "N", "><Passport\n>");

  xml = fillEmpty(xml, "natIDIndicator", a.hasNatId === "Y" ? "Y" : "N");
  if (a.hasNatId === "Y") {
    xml = fillNested(xml, "DocNum", a.natIdNumber || "", "><natIDdocs\n>");
    xml = fillNested(xml, "CountryofIssue", a.natIdCountry || "", "><natIDdocs\n>");
  }
  xml = fillEmpty(xml, "usCardIndicator", a.hasUsCard === "Y" ? "Y" : "N");
  if (a.hasUsCard === "Y") {
    xml = fillNested(xml, "DocNum", a.usCardNumber || "", "><usCarddocs\n>");
  }

  if (a.aptUnit) xml = fillEmpty(xml, "AptUnit", a.aptUnit, "><Mailing\n>");
  xml = fillEmpty(xml, "StreetNum", a.streetNum, "><Mailing\n>");
  xml = fillEmpty(xml, "Streetname", a.streetName, "><Mailing\n>");
  xml = fillEmpty(xml, "City", a.city, "><Mailing\n><AddrLine2\n>");
  xml = fillEmpty(xml, "Country", a.country, "><Mailing\n><AddrLine2\n>");
  xml = fillEmpty(xml, "Prov", a.provinceState, "><Mailing\n><AddrLine2\n>");
  xml = fillEmpty(xml, "PostalCode", a.postalCode, "><Mailing\n><AddrLine2\n>");
  xml = fillEmpty(xml, "SameAsMailingInd", a.sameAsMailing, "><Resi\n>");

  xml = xml.replace(
    /<Phone\n><CanOtherInd\n>[\s\S]*?<\/CanOtherInd\n><ActualNumber\n\/>/,
    `<Phone\n><CanOtherInd\n><CanadaUS\n>0</CanadaUS\n><Other\n>1</Other\n></CanOtherInd\n><ActualNumber\n>${esc(phoneDigits(a.phone))}</ActualNumber\n>`,
  );
  xml = fillEmpty(xml, "Type", a.phoneType || "02", "><Phone\n>");
  xml = fillEmpty(xml, "NumberCountry", a.phoneCountryCode, "><Phone\n>");
  xml = fillNested(xml, "IntlNumber", phoneDigits(a.phone), "><Phone\n>");
  xml = fillNested(xml, "Email", a.email);

  if (a.origEntryDate) xml = fillEmpty(xml, "DateLastEntry", a.origEntryDate, "><OrigEntry\n>");
  if (a.origEntryPlace) xml = fillEmpty(xml, "Place", a.origEntryPlace, "><OrigEntry\n>");
  if (a.purposeOfVisit) {
    xml = fillEmpty(xml, "PurposeOfVisit", a.purposeOfVisit, "><ComingIntoCda\n>");
  }
  if (a.purposeOther) xml = fillEmpty(xml, "Other", a.purposeOther, "><PurposeOfVisit\n>");
  if (a.recentEntryDate) xml = fillEmpty(xml, "DateLastEntry", a.recentEntryDate, "><RecentEntry\n>");
  if (a.recentEntryPlace) xml = fillEmpty(xml, "Place", a.recentEntryPlace, "><RecentEntry\n>");
  if (a.prevDocNum) xml = fillEmpty(xml, "docNum", a.prevDocNum, "><PrevDocNum\n>");

  const workFrom = isoDate(a.workFromYear, a.workFromMonth, a.workFromDay);
  const workTo = isoDate(a.workToYear, a.workToMonth, a.workToDay);
  xml = xml.replace(
    /<DetailsOfWork\n>[\s\S]*?<\/DetailsOfWork\n>/,
      `<DetailsOfWork\n><Purpose\n><Type\n>${esc(a.workPurposeType || "LMOS")}</Type\n>` +
      (a.workPurposeOther ? `<Other\n>${esc(a.workPurposeOther)}</Other\n>` : `<Other\n/>`) +
      `</Purpose\n><Employer\n><Name\n>${esc(a.employerName)}</Name\n><Addr\n>${esc(a.employerAddress)}</Addr\n></Employer\n>` +
      `<Location\n><Prov\n>${esc(a.workProvince)}</Prov\n><City\n>${esc(a.workCity)}</City\n>` +
      (a.workLocationAddress ? `<Addr\n>${esc(a.workLocationAddress)}</Addr\n>` : `<Addr\n/>`) +
      `</Location\n><Occupation\n><Job\n>${esc(a.jobTitle)}</Job\n><Desc\n>${esc(a.jobDescription)}</Desc\n></Occupation\n>` +
      `<Duration\n><FromDate\n>${esc(workFrom)}</FromDate\n><ToDate\n>${esc(workTo)}</ToDate\n>` +
      `<LMO\n>${esc(String(a.lmiaNumber || "").replace(/\D/g, ""))}</LMO\n></Duration\n>` +
      (a.caqNumber
        ? `<CAQ\n><CertNum\n>${esc(a.caqNumber)}</CertNum\n>` +
          (a.caqExpiryYear
            ? `<CertExpiry\n>${esc(isoDate(a.caqExpiryYear, a.caqExpiryMonth || "01", a.caqExpiryDay || "01"))}</CertExpiry\n>`
            : `<CertExpiry\n/>`) + `</CAQ\n>`
        : `<CAQ\n><CertNum\n/><CertExpiry\n/></CAQ\n>`) +
      `<ProvNominee\n><ProvNominee\n>${esc(a.provNominee || "")}</ProvNominee\n></ProvNominee\n></DetailsOfWork\n>`,
  );

  xml = fillEmpty(xml, "EducationIndicator", a.educationIndicator);
  if (a.educationIndicator === "Y" && a.educationRow) {
    const e = a.educationRow;
    xml = fillEmpty(xml, "YYYY", e.fromYear, "><EduLine1\n><From\n>");
    xml = fillEmpty(xml, "MM", e.fromMonth, "><EduLine1\n><From\n>");
    xml = fillEmpty(xml, "FieldOfStudy", e.fieldOfStudy, "><EduLine1\n>");
    xml = fillEmpty(xml, "School", e.school, "><EduLine1\n>");
    xml = fillEmpty(xml, "YYYY", e.toYear, "><EduLine2\n><To\n>");
    xml = fillEmpty(xml, "MM", e.toMonth, "><EduLine2\n><To\n>");
    xml = fillEmpty(xml, "City", e.city, "><EduLine2\n>");
    xml = fillEmpty(xml, "Country", resolveCountryLic(e.country), "><EduLine2\n>");
    if (e.provinceState) xml = fillEmpty(xml, "Prov", e.provinceState, "><EduLine2\n>");
  }

  const empMarkers = ["><EmpRec1\n>", "><EmpRec2\n>", "><EmpRec3\n>"];
  jobs.forEach((job, i) => {
    const after = empMarkers[i];
    xml = fillEmpty(xml, "YYYY", job.fromYear, after);
    xml = fillEmpty(xml, "MM", job.fromMonth, after);
    xml = fillEmpty(xml, "Occupation", job.occupation, after);
    xml = fillEmpty(xml, "Employer", job.employer, after);
    if (job.toYear) xml = fillEmpty(xml, "YYYY", job.toYear, after);
    if (job.toMonth) xml = fillEmpty(xml, "MM", job.toMonth, after);
    xml = fillEmpty(xml, "City", job.city, after);
    xml = fillEmpty(xml, "Country", job.country, after);
    if (job.provinceState) xml = fillEmpty(xml, "ProvState", job.provinceState, after);
  });

  xml = fillEmpty(xml, "qANY", a.bgTb, "><HealthQ\n>");
  xml = fillEmpty(xml, "qBNY", a.bgDisorder, "><HealthQ\n>");
  if (a.bgMedicalDetails) xml = fillEmpty(xml, "MedicalDetails", a.bgMedicalDetails);
  xml = fillEmpty(xml, "qANY", a.bgOverstay, "><PrevApplied\n>");
  xml = fillEmpty(xml, "qBNY", a.bgRefused, "><PrevApplied\n>");
  xml = fillEmpty(xml, "qCNY", a.bgClaimAsylum, "><PrevApplied\n>");
  if (a.bgRefusedDetails) xml = fillEmpty(xml, "refusedDetails", a.bgRefusedDetails);
  xml = fillEmpty(xml, "qANY", a.bgCrime, "><Criminal\n>");
  if (a.bgCrimeDetails) xml = fillEmpty(xml, "refusedDetails", a.bgCrimeDetails, "><Criminal\n>");
  xml = fillEmpty(xml, "qANY", a.bgMilitary, "><Military\n>");
  if (a.bgMilitaryDetails) xml = fillEmpty(xml, "militaryServiceDetails", a.bgMilitaryDetails);
  xml = fillEmpty(xml, "Choice", a.bgViolence, "><BackgroundInfo\n><Occupation\n>");
  xml = fillEmpty(xml, "qGovtNY", a.bgWitness, "><GovPosition\n>");
  xml = fillEmpty(xml, "qWitnessNY", a.bgWitness, "><Illtreatment\n>");
  xml = fillEmpty(xml, "FutureComm", a.cicContactConsent, "><Signature\n>");

  return xml;
}

export function patchForm5710(datasetsXml: string, answers: Imm5710Answers): string {
  const start = datasetsXml.indexOf("<form1");
  if (start < 0) throw new Error("form1 missing in XFA datasets");
  const endMatch = datasetsXml.slice(start).match(/<\/form1\n?>/);
  if (!endMatch || endMatch.index === undefined) throw new Error("form1 close tag missing");
  const end = start + endMatch.index + endMatch[0].length;
  const filled = buildFilledForm5710(datasetsXml.slice(start, end), answers);
  return datasetsXml.slice(0, start) + filled + datasetsXml.slice(end);
}

export async function fillImm5710Pdf(
  blankPdf: Uint8Array,
  answers: Imm5710Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm5710${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  const normalized = normalize5710Answers(answers);
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) => patchForm5710(xml, normalized));
}
