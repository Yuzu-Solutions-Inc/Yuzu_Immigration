/**
 * Work-permit kit patchers — kit-local checklists + selectForms;
 * companions live in _shared/patch_companions.ts.
 */
import {
  patchImm5409 as patchImm5409Shared,
  patchImm5475 as patchImm5475Shared,
  patchImm5476 as patchImm5476Shared,
  patchImm5707 as patchImm5707Shared,
  type CompanionAnswers,
} from "./patch-companions";

export type KitAnswers = CompanionAnswers & {
  email: string;
  formLanguage: "e" | "f";
  forms: string[];
  applicationLocation: "outside" | "inside";
  workPermitType?: string;
  applyingRestore?: boolean;
  applyingExtend?: boolean;
  applyingNewEmployer?: boolean;
  applyingTrp?: boolean;
  employerName?: string;
  employerAddress?: string;
  workProvince?: string;
  workCity?: string;
  workLocationAddress?: string;
  jobDescription?: string;
  workFromYear?: string;
  workFromMonth?: string;
  workFromDay?: string;
  workToYear?: string;
  workToMonth?: string;
  workToDay?: string;
  lmiaNumber?: string;
  lcpChildCare?: boolean;
  lcpDisabled?: boolean;
  lcpElderly?: boolean;
  lcpOther?: boolean;
  lcpNoPersons?: string;
  origEntryDate?: string;
  origEntryPlace?: string;
  purposeOfVisit?: string;
  recentEntryDate?: string;
  recentEntryPlace?: string;
  prevDocNum?: string;
  parent1Telephone?: string;
  parent2Telephone?: string;
};

export function patchImm5707(xml: string, a: KitAnswers): string {
  return patchImm5707Shared(xml, a, { defaultOccupation: "Worker" });
}

export function patchImm5476(xml: string, a: KitAnswers): string {
  return patchImm5476Shared(xml, a, { applicationLabel: "Work permit" });
}

export function patchImm5475(xml: string, a: KitAnswers): string {
  return patchImm5475Shared(xml, a);
}

export function patchImm5409(xml: string, a: KitAnswers): string {
  return patchImm5409Shared(xml, a);
}

function setFormsListRow(xml: string, row: number, on: boolean): string {
  const re = new RegExp(
    `(<Row${row}\\n><CheckBox1\\n>)[01](</CheckBox1\\n></Row${row}\\n>)`,
  );
  return xml.replace(re, `$1${on ? "1" : "0"}$2`);
}

function setDocsListRow(xml: string, row: number, on: boolean): string {
  const re = new RegExp(
    `(<DocumentsList\\n>[\\s\\S]*?<Row${row}\\n><CheckBox1\\n>)[01](</CheckBox1\\n></Row${row}\\n>)`,
  );
  return xml.replace(re, `$1${on ? "1" : "0"}$2`);
}

export function patchImm5488(xml: string, a: KitAnswers): string {
  const selected = new Set(a.forms.map((f) => f.toLowerCase()));
  let out = xml;
  out = setFormsListRow(out, 1, selected.has("imm1295"));
  out = setFormsListRow(out, 2, selected.has("imm5707"));
  out = setFormsListRow(out, 3, selected.has("imm5476"));
  out = setFormsListRow(out, 4, selected.has("imm5475"));
  out = setFormsListRow(out, 5, selected.has("imm5409"));
  for (let i = 1; i <= 12; i++) out = setDocsListRow(out, i, true);
  return out;
}

export function patchImm5556(xml: string, a: KitAnswers): string {
  const selected = new Set(a.forms.map((f) => f.toLowerCase()));
  let out = xml;
  out = out.replace(
    /<row1\n><CheckBox2\n>0<\/CheckBox2\n>/,
    `<row1\n><CheckBox2\n>${selected.has("imm5710") ? "1" : "0"}</CheckBox2\n>`,
  );
  out = out.replace(
    /<row2\n><CheckBox3\n>0<\/CheckBox3\n>/,
    `<row2\n><CheckBox3\n>${selected.has("imm5707") ? "1" : "0"}</CheckBox3\n>`,
  );
  out = out.replace(
    /<row3\n><CheckBox4\n>0<\/CheckBox4\n>/,
    `<row3\n><CheckBox4\n>${selected.has("imm5476") ? "1" : "0"}</CheckBox4\n>`,
  );
  out = out.replace(
    /<row5\n><CheckBox7\n>0<\/CheckBox7\n>/,
    `<row5\n><CheckBox7\n>${selected.has("imm5475") ? "1" : "0"}</CheckBox7\n>`,
  );
  out = out.replace(
    /<row7\n><CheckBox9\n>0<\/CheckBox9\n>/g,
    `<row7\n><CheckBox9\n>1</CheckBox9\n>`,
  );
  return out;
}

export function selectForms(input: {
  applicationLocation?: "outside" | "inside";
  hasRepresentative?: boolean;
  hasDesignee?: boolean;
  isCommonLaw?: boolean;
}): string[] {
  const inside = input.applicationLocation === "inside";
  const primary = inside ? "imm5710" : "imm1295";
  const checklist = inside ? "imm5556" : "imm5488";
  // IMM 5476 always — consultant represents the client in MyConsultant.
  const forms = [primary, "imm5707", checklist, "imm5476"];
  if (input.hasDesignee) forms.push("imm5475");
  if (input.isCommonLaw) forms.push("imm5409");
  return forms;
}
