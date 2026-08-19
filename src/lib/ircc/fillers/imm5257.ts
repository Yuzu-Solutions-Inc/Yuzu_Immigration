/**
 * Fill IMM 5257 — visitor visa (outside Canada).
 * Personal blocks match IMM 1294; visit details replace the study block.
 */
import formMeta from "../form-meta.json";
import { fillXfaDatasetsIncremental, mapForm1, type FormMeta } from "../xfa-incremental";
import {
  type Imm1294Answers,
  buildFilledForm1,
  normalizeAnswers,
} from "./imm1294";

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isoDate(y: string, m: string, d: string): string {
  if (!y) return "";
  return `${y}-${String(m || "01").padStart(2, "0")}-${String(d || "01").padStart(2, "0")}`;
}

export type Imm5257Answers = Imm1294Answers & {
  visaType?: string;
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
};

function toShim(a: Imm5257Answers): Imm1294Answers {
  return {
    ...a,
    schoolName: "",
    studyLevel: "",
    fieldOfStudy: "",
    schoolProvince: "",
    schoolCity: "",
    schoolAddress: "",
    dli: "",
    studyFromYear: "",
    studyFromMonth: "",
    studyFromDay: "",
    studyToYear: "",
    studyToMonth: "",
    studyToDay: "",
    tuitionAmount: "",
    availableFunds: a.availableFunds || a.visitFundsAmount || "",
    funds: a.funds || a.visitExpensePayer || "Myself",
  };
}

function patchVisit(xml: string, a: Imm5257Answers): string {
  const from = isoDate(a.visitFromYear || "", a.visitFromMonth || "", a.visitFromDay || "");
  const to = isoDate(a.visitToYear || "", a.visitToMonth || "", a.visitToDay || "");
  if (a.visaType) {
    xml = xml.replace(
      /<VisaType\n><VisaType\n\/><\/VisaType\n>/,
      `<VisaType\n><VisaType\n>${esc(a.visaType)}</VisaType\n></VisaType\n>`,
    );
  }
  xml = xml.replace(
    /<DetailsOfVisit\n>[\s\S]*?<\/DetailsOfVisit\n>/,
    `<DetailsOfVisit\n><PurposeRow1\n>` +
      `<PurposeOfVisit\n><PurposeOfVisit\n>${esc(a.visitPurpose || "")}</PurposeOfVisit\n></PurposeOfVisit\n>` +
      `<Other\n><Other\n>${esc(a.visitPurposeOther || "")}</Other\n></Other\n>` +
      `<HowLongStay\n><FromDate\n>${esc(from)}</FromDate\n><ToDate\n>${esc(to)}</ToDate\n>` +
      `<StayDates\n/></HowLongStay\n>` +
      `<Funds\n><Funds\n>${esc(a.visitFundsAmount || a.availableFunds || "")}</Funds\n></Funds\n>` +
      `</PurposeRow1\n><Contacts_Row1\n>` +
      `<Name\n><Name\n>${esc(a.visitHostName || "")}</Name\n></Name\n>` +
      `<RelationshipToMe\n><RelationshipToMe\n>${esc(a.visitHostRelationship || "")}</RelationshipToMe\n></RelationshipToMe\n>` +
      `<AddressInCanada\n><AddressInCanada\n>${esc(a.visitHostAddress || "")}</AddressInCanada\n></AddressInCanada\n>` +
      `</Contacts_Row1\n></DetailsOfVisit\n>`,
  );
  if (a.visitHost2Name) {
    xml = xml.replace(
      /<Contacts_Row2\n>[\s\S]*?<\/Contacts_Row2\n>/,
      `<Contacts_Row2\n><Name\n><Name\n>${esc(a.visitHost2Name)}</Name\n></Name\n>` +
        `<Relationship\n><RelationshipToMe\n>${esc(a.visitHost2Relationship || "")}</RelationshipToMe\n></Relationship\n>` +
        `<AddressInCanada\n><AddressInCanada\n>${esc(a.visitHost2Address || "")}</AddressInCanada\n></AddressInCanada\n>` +
        `</Contacts_Row2\n>`,
    );
  }
  return xml;
}

export async function fillImm5257Pdf(
  blankPdf: Uint8Array,
  answers: Imm5257Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm5257${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  const normalized = normalizeAnswers(toShim(answers));
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) =>
    mapForm1(xml, (form1) => patchVisit(buildFilledForm1(form1, normalized), answers)),
  );
}
