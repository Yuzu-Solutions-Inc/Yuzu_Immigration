/**
 * Fill IMM 5708 — change conditions / extend stay as a visitor (in Canada).
 */
import formMeta from "../form-meta.json";
import { fillXfaDatasetsIncremental, mapForm1, type FormMeta } from "../xfa-incremental";
import {
  type Imm5710Answers,
  normalize5710Answers,
  buildFilledForm5710,
} from "./imm5710";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isoDate(y: string, m: string, d: string): string {
  if (!y) return "";
  return `${y}-${String(m || "01").padStart(2, "0")}-${String(d || "01").padStart(2, "0")}`;
}

export type Imm5708Answers = Imm5710Answers & {
  visitPurpose?: string;
  visitPurposeOther?: string;
  visitFromYear?: string;
  visitFromMonth?: string;
  visitFromDay?: string;
  visitToYear?: string;
  visitToMonth?: string;
  visitToDay?: string;
  visitHostName?: string;
  visitHostRelationship?: string;
  visitHostAddress?: string;
  visitHost2Name?: string;
  visitHost2Relationship?: string;
  visitHost2Address?: string;
  visitFunds?: string;
  visitFundsAmount?: string;
  visitExpensePayer?: string;
  availableFunds?: string;
  funds?: string;
  fundsOtherPerson?: string;
};

function patchVisit(xml: string, a: Imm5708Answers): string {
  const from = isoDate(a.visitFromYear || "", a.visitFromMonth || "", a.visitFromDay || "");
  const to = isoDate(a.visitToYear || "", a.visitToMonth || "", a.visitToDay || "");
  xml = xml.replace(
    /<DetailsOfVisit\n>[\s\S]*?<\/DetailsOfVisit\n>/,
    `<DetailsOfVisit\n><Purpose\n>` +
      `<Purpose\n>${esc(a.visitPurpose || a.purposeOfVisit || "")}</Purpose\n>` +
      `<Other\n>${esc(a.visitPurposeOther || a.purposeOther || "")}</Other\n>` +
      `<Stay\n><FromDate\n>${esc(from)}</FromDate\n><ToDate\n>${esc(to)}</ToDate\n></Stay\n>` +
      `</Purpose\n><Funds\n>` +
      `<FundsAvail\n>${esc(a.visitFundsAmount || a.availableFunds || a.visitFunds || "")}</FundsAvail\n>` +
      `<ExpPaidBy\n>${esc(a.visitExpensePayer || a.funds || "")}</ExpPaidBy\n>` +
      `<Other\n>${esc(a.fundsOtherPerson || "")}</Other\n></Funds\n>` +
      `<WillVisit\n><VisitList\n>` +
      `<Rec1\n><Name\n>${esc(a.visitHostName || "")}</Name\n>` +
      `<Relationship\n>${esc(a.visitHostRelationship || "")}</Relationship\n>` +
      `<Addr\n>${esc(a.visitHostAddress || "")}</Addr\n></Rec1\n>` +
      `<Rec2\n><Name\n>${esc(a.visitHost2Name || "")}</Name\n>` +
      `<Relationship\n>${esc(a.visitHost2Relationship || "")}</Relationship\n>` +
      `<Addr\n>${esc(a.visitHost2Address || "")}</Addr\n></Rec2\n>` +
      `</VisitList\n></WillVisit\n></DetailsOfVisit\n>`,
  );
  return xml;
}

export async function fillImm5708Pdf(
  blankPdf: Uint8Array,
  answers: Imm5708Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm5708${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  const mapped: Imm5710Answers = {
    ...answers,
    inlandVariant: "visit",
    applyingExtend: answers.applyingExtend || false,
    applyingRestore: answers.applyingRestore || false,
    employerName: answers.employerName || "",
    employerAddress: answers.employerAddress || "",
    workCity: answers.workCity || answers.city || "",
    workProvince: answers.workProvince || answers.provinceState || "",
    jobTitle: answers.jobTitle || "",
    jobDescription: answers.jobDescription || "",
    workFromYear: answers.workFromYear || answers.visitFromYear || "",
    workFromMonth: answers.workFromMonth || answers.visitFromMonth || "",
    workFromDay: answers.workFromDay || answers.visitFromDay || "",
    workToYear: answers.workToYear || answers.visitToYear || "",
    workToMonth: answers.workToMonth || answers.visitToMonth || "",
    workToDay: answers.workToDay || answers.visitToDay || "",
    applyingNewEmployer: false,
  };
  const normalized = normalize5710Answers(mapped);
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) =>
    mapForm1(xml, (form1) => patchVisit(buildFilledForm5710(form1, normalized), answers)),
  );
}
