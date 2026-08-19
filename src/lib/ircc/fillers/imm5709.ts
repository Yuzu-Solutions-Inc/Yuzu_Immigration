/**
 * Fill IMM 5709 — change conditions / extend stay as a student (in Canada).
 * Personal / entry / background blocks match IMM 5710; study details use
 * DetailsOfStudy (not the work-permit DetailsOfWork block).
 */
import formMeta from "../form-meta.json";
import { fillXfaDatasetsIncremental, mapForm1, type FormMeta } from "../xfa-incremental";
import {
  type Imm5710Answers,
  normalize5710Answers,
  buildFilledForm5710,
} from "./imm5710";

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const PROVINCE_LIC: Record<string, string> = {
  AB: "09", BC: "11", MB: "07", NB: "04", NL: "01", NS: "03", NT: "10", NU: "64",
  ON: "06", PE: "02", QC: "05", SK: "08", YT: "12",
};

function provinceLic(value: string | undefined): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (/^\d{2}$/.test(raw)) return raw;
  return PROVINCE_LIC[raw] || raw;
}

function isoDate(y: string, m: string, d: string): string {
  if (!y) return "";
  return `${y}-${String(m || "01").padStart(2, "0")}-${String(d || "01").padStart(2, "0")}`;
}

export type Imm5709Answers = Imm5710Answers & {
  schoolName?: string;
  schoolAddress?: string;
  schoolCity?: string;
  schoolProvince?: string;
  studyLevel?: string;
  fieldOfStudy?: string;
  dli?: string;
  studentId?: string;
  studyFromYear?: string;
  studyFromMonth?: string;
  studyFromDay?: string;
  studyToYear?: string;
  studyToMonth?: string;
  studyToDay?: string;
  tuitionAmount?: string;
  roomBoard?: string;
  otherStudyCosts?: string;
  availableFunds?: string;
  funds?: string;
  fundsOtherPerson?: string;
  palNumber?: string;
  palExpiryYear?: string;
  palExpiryMonth?: string;
  palExpiryDay?: string;
  studyNeedsWorkPermit?: boolean | string;
  studyWorkPermitType?: string;
};

function patchDetailsOfStudy(xml: string, a: Imm5709Answers): string {
  const from = isoDate(
    a.studyFromYear || a.workFromYear,
    a.studyFromMonth || a.workFromMonth || "",
    a.studyFromDay || a.workFromDay || "",
  );
  const to = isoDate(
    a.studyToYear || a.workToYear,
    a.studyToMonth || a.workToMonth || "",
    a.studyToDay || a.workToDay || "",
  );
  const caqExp = a.caqExpiryYear
    ? isoDate(a.caqExpiryYear, a.caqExpiryMonth || "01", a.caqExpiryDay || "01")
    : "";
  const palExp = a.palExpiryYear
    ? isoDate(a.palExpiryYear, a.palExpiryMonth || "01", a.palExpiryDay || "01")
    : "";
  const needsWp =
    a.studyNeedsWorkPermit === true ||
    String(a.studyNeedsWorkPermit || "").toUpperCase() === "Y";

  xml = xml.replace(
    /<DetailsOfStudy\n>[\s\S]*?<\/DetailsOfStudy\n>/,
    `<DetailsOfStudy\n><SchoolDetails\n>` +
      `<SchoolName\n>${esc(a.schoolName || "")}</SchoolName\n>` +
      `<StudyMajor\n><Program\n>${esc(a.fieldOfStudy || "")}</Program\n>` +
      `<Level\n>${esc(a.studyLevel || "")}</Level\n></StudyMajor\n>` +
      `<Prov\n>${esc(provinceLic(a.schoolProvince || a.workProvince))}</Prov\n>` +
      `<CityTown\n>${esc(a.schoolCity || a.workCity || "")}</CityTown\n>` +
      `<Address\n>${esc(a.schoolAddress || "")}</Address\n>` +
      `<DLI\n>${esc(a.dli || "")}</DLI\n>` +
      `<StudentNo\n>${esc(a.studentId || "")}</StudentNo\n>` +
      `<StudyTerm\n><FromDate\n>${esc(from)}</FromDate\n><ToDate\n>${esc(to)}</ToDate\n></StudyTerm\n>` +
      `<EduCosts\n><Tuition\n>${esc(a.tuitionAmount || "")}</Tuition\n>` +
      `<Room\n>${esc(a.roomBoard || "")}</Room\n>` +
      `<OtherCosts\n>${esc(a.otherStudyCosts || "")}</OtherCosts\n></EduCosts\n>` +
      `<Funds\n><FundsAvail\n>${esc(a.availableFunds || "")}</FundsAvail\n>` +
      `<ExpPaidBy\n>${esc(a.funds || "")}</ExpPaidBy\n>` +
      `<Other\n>${esc(a.fundsOtherPerson || "")}</Other\n></Funds\n>` +
      `</SchoolDetails\n></DetailsOfStudy\n>`,
  );

  xml = xml.replace(
    /<WorkPermit\n>[\s\S]*?<\/WorkPermit\n>/,
    `<WorkPermit\n><a\n><WorkPermit\n>${needsWp ? "Y" : "N"}</WorkPermit\n></a\n>` +
      `<PermitType\n>${esc(needsWp ? a.studyWorkPermitType || a.workPurposeType || "" : "")}</PermitType\n></WorkPermit\n>`,
  );

  if (a.caqNumber) {
    xml = xml.replace(
      /<CAQ\n>[\s\S]*?<\/CAQ\n>/,
      `<CAQ\n><CertNum\n>${esc(a.caqNumber)}</CertNum\n>` +
        (caqExp ? `<CertExpiry\n>${esc(caqExp)}</CertExpiry\n>` : `<CertExpiry\n/>`) +
        `</CAQ\n>`,
    );
  }
  if (a.palNumber) {
    xml = xml.replace(
      /<PAL\n>[\s\S]*?<\/PAL\n>/,
      `<PAL\n><PALDocNum\n>${esc(a.palNumber)}</PALDocNum\n>` +
        (palExp ? `<DocExpiry\n>${esc(palExp)}</DocExpiry\n>` : `<DocExpiry\n/>`) +
        `</PAL\n>`,
    );
  }
  return xml;
}

export async function fillImm5709Pdf(
  blankPdf: Uint8Array,
  answers: Imm5709Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm5709${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  const mapped: Imm5710Answers = {
    ...answers,
    inlandVariant: "study",
    employerName: answers.employerName || "",
    employerAddress: answers.employerAddress || "",
    workCity: answers.workCity || answers.schoolCity || "",
    workProvince: answers.workProvince || answers.schoolProvince || "",
    jobTitle: answers.jobTitle || "",
    jobDescription: answers.jobDescription || "",
    applyingNewEmployer: false,
  };
  const normalized = normalize5710Answers(mapped);
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) =>
    mapForm1(xml, (form1) =>
      patchDetailsOfStudy(buildFilledForm5710(form1, normalized), answers),
    ),
  );
}
