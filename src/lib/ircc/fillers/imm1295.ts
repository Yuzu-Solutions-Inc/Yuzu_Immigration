/**
 * Fill IMM 1295 (work permit outside Canada) — shares XFA structure with IMM 1294.
 */
import cityCodes from "../codes/city-codes.json";
import {
  type Imm1294Answers,
  buildFilledForm1,
  normalizeAnswers,
} from "./imm1294";
import formMeta from "../form-meta.json";
import { fillXfaDatasetsIncremental, type FormMeta } from "../xfa-incremental";

const PROVINCE_LIC: Record<string, string> = {
  AB: "09", BC: "11", MB: "07", NB: "04", NL: "01", NS: "03", NT: "10", NU: "64",
  ON: "06", PE: "02", QC: "05", SK: "08", YT: "12",
};

export type WorkPermitTypeLic = "ELMO" | "LMOS" | "OWP" | "Other" | "SAWP" | "SBC";

export type Imm1295Answers = Omit<
  Imm1294Answers,
  | "schoolName"
  | "studyLevel"
  | "fieldOfStudy"
  | "schoolProvince"
  | "schoolCity"
  | "schoolAddress"
  | "dli"
  | "studyFromYear"
  | "studyFromMonth"
  | "studyFromDay"
  | "studyToYear"
  | "studyToMonth"
  | "studyToDay"
  | "tuitionAmount"
  | "availableFunds"
  | "funds"
  | "fundsOtherPerson"
  | "palNumber"
  | "palExpiryYear"
  | "palExpiryMonth"
  | "palExpiryDay"
> & {
  workPermitType: WorkPermitTypeLic | string;
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
  lcpChildCare?: boolean;
  lcpDisabled?: boolean;
  lcpElderly?: boolean;
  lcpOther?: boolean;
  lcpNoPersons?: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isoDate(y: string, m: string, d: string): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function resolveWorkPermitType(raw: string): WorkPermitTypeLic {
  const v = String(raw || "").trim().toUpperCase();
  const map: Record<string, WorkPermitTypeLic> = {
    ELMO: "ELMO",
    LMOS: "LMOS",
    OWP: "OWP",
    OTHER: "Other",
    SAWP: "SAWP",
    SBC: "SBC",
    OPEN: "OWP",
    EMPLOYER: "LMOS",
    LMIA: "LMOS",
  };
  if (map[v]) return map[v];
  if (["ELMO", "LMOS", "OWP", "Other", "SAWP", "SBC"].includes(raw)) {
    return raw as WorkPermitTypeLic;
  }
  return "LMOS";
}

function toImm1294Shim(a: Imm1295Answers): Imm1294Answers {
  return {
    ...a,
    schoolName: a.employerName,
    studyLevel: "04",
    fieldOfStudy: "04",
    schoolProvince: a.workProvince,
    schoolCity: a.workCity,
    schoolAddress: a.employerAddress,
    dli: "O9999999",
    studyFromYear: a.workFromYear,
    studyFromMonth: a.workFromMonth,
    studyFromDay: a.workFromDay,
    studyToYear: a.workToYear,
    studyToMonth: a.workToMonth,
    studyToDay: a.workToDay,
    tuitionAmount: "0",
    availableFunds: "0",
    funds: "Myself",
  };
}

function resolveProvinceLic(value: string): string {
  const raw = value.trim().toUpperCase();
  if (/^\d{2}$/.test(raw)) return raw;
  if (PROVINCE_LIC[raw]) return PROVINCE_LIC[raw];
  return value.trim();
}

function resolveCityLic(value: string): string {
  const raw = value.trim();
  if (/^\d+$/.test(raw)) return raw;
  const { aliases, labels } = cityCodes as {
    aliases: Record<string, string>;
    labels: Record<string, string>;
  };
  if (aliases[raw.toLowerCase()]) return aliases[raw.toLowerCase()];
  if (labels[raw]) return labels[raw];
  for (const [label, lic] of Object.entries(labels)) {
    if (label.toLowerCase() === raw.toLowerCase() && lic) return lic;
  }
  return raw;
}

function patchWorkSections(xml: string, a: Imm1295Answers): string {
  let out = xml;
  const permitType = resolveWorkPermitType(a.workPermitType);
  const workFrom = isoDate(a.workFromYear, a.workFromMonth, a.workFromDay);
  const workTo = isoDate(a.workToYear, a.workToMonth, a.workToDay);
  // Acrobat validates LMIA No. as an integer in [6000000, 99999999].
  const lmo = String(a.lmiaNumber || "").replace(/\D/g, "").trim();
  const workProv = resolveProvinceLic(a.workProvince);
  const workCity = resolveCityLic(a.workCity);

  out = out.replace(
    /<DetailsOfIntendedWork\n>[\s\S]*?<\/DetailsOfIntendedWork\n>/,
    `<DetailsOfIntendedWork\n><DetailsOfWork\n><TypeofWork\n><WorkPermitType\n>${esc(permitType)}</WorkPermitType\n></TypeofWork\n>` +
      `<PurposeRow1\n><EmployerName\n><EmployerName\n>${esc(a.employerName)}</EmployerName\n></EmployerName\n>` +
      `<Address\n><Address\n>${esc(a.employerAddress)}</Address\n></Address\n></PurposeRow1\n></DetailsOfWork\n></DetailsOfIntendedWork\n>`,
  );

  out = out.replace(
    /<IntendedLocationInCanada\n>[\s\S]*?<\/IntendedLocationInCanada\n>/,
    `<IntendedLocationInCanada\n><intendedLocation\n>` +
      `<ProvinceState\n><ProvinceState\n>${esc(workProv)}</ProvinceState\n></ProvinceState\n>` +
      `<CityTown\n><CityTown\n>${esc(workCity)}</CityTown\n></CityTown\n>` +
      (a.workLocationAddress
        ? `<Address\n>${esc(a.workLocationAddress)}</Address\n>`
        : `<Address\n/>`) +
      `</intendedLocation\n></IntendedLocationInCanada\n>`,
  );

  out = out.replace(
    /<DetailsOfWorkCont\n>[\s\S]*?<\/DetailsOfWorkCont\n>/,
    `<DetailsOfWorkCont\n><details\n><jobTitle\n>${esc(a.jobTitle)}</jobTitle\n>` +
      `<posDesc\n>${esc(a.jobDescription)}</posDesc\n>` +
      `<HowLongStudy\n><FromDate\n>${esc(workFrom)}</FromDate\n><ToDate\n>${esc(workTo)}</ToDate\n></HowLongStudy\n>` +
      `<LMO\n><LMO\n>${esc(lmo)}</LMO\n></LMO\n></details\n></DetailsOfWorkCont\n>`,
  );

  const child = a.lcpChildCare ? "1" : "0";
  const disabled = a.lcpDisabled ? "1" : "0";
  const elderly = a.lcpElderly ? "1" : "0";
  const other = a.lcpOther ? "1" : "0";
  const noPersons = (a.lcpNoPersons || "").trim();
  out = out.replace(
    /<LCP\n>[\s\S]*?<\/LCP\n>/,
    `<LCP\n><LCP_SectionHeader xfa:dataNode="dataGroup"\n/><Caregiver\n>` +
      `<ChildCare\n>${child}</ChildCare\n><Disabled\n>${disabled}</Disabled\n>` +
      `<Elderly\n>${elderly}</Elderly\n><Other\n>${other}</Other\n>` +
      `<checkBoxCalcField\n/><personsCare\n>` +
      (noPersons ? `<noPersons\n>${esc(noPersons)}</noPersons\n>` : `<noPersons\n/>`) +
      `</personsCare\n></Caregiver\n></LCP\n>`,
  );

  out = out.replace(/<tuition\n>[\s\S]*?<\/tuition\n>/g, "");
  out = out.replace(/<expensesPaid\n>[\s\S]*?<\/expensesPaid\n>/g, "");
  out = out.replace(/<PAL\n>[\s\S]*?<\/PAL\n>/g, "");

  if (a.caqNumber) {
    const caqExp = a.caqExpiryYear
      ? isoDate(a.caqExpiryYear, a.caqExpiryMonth || "01", a.caqExpiryDay || "01")
      : "";
    out = out.replace(
      /<CAQ\n>[\s\S]*?<\/CAQ\n>/,
      `<CAQ\n><CertNum\n>${esc(a.caqNumber)}</CertNum\n>` +
        (caqExp ? `<CertExpiry\n>${esc(caqExp)}</CertExpiry\n>` : `<CertExpiry\n/>`) +
        `</CAQ\n>`,
    );
  }

  return out;
}

export function patchForm1(datasetsXml: string, answers: Imm1295Answers): string {
  const start = datasetsXml.indexOf("<form1");
  if (start < 0) throw new Error("form1 missing in XFA datasets");
  const endMatch = datasetsXml.slice(start).match(/<\/form1\n?>/);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error("form1 close tag missing");
  }
  const end = start + endMatch.index + endMatch[0].length;
  const shim = normalizeAnswers(toImm1294Shim(answers));
  let filled = buildFilledForm1(datasetsXml.slice(start, end), shim);
  filled = patchWorkSections(filled, answers);
  return datasetsXml.slice(0, start) + filled + datasetsXml.slice(end);
}

export async function fillImm1295Pdf(
  blankPdf: Uint8Array,
  answers: Imm1295Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm1295${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) => patchForm1(xml, answers));
}
