/**
 * Study-permit kit patchers — kit-local checklists + selectForms;
 * companions live in _shared/patch_companions.ts.
 */
import {
  setCheckbox,
  setEmptyTag,
} from "./xfa-incremental";
import {
  ascii,
  mailingAddress,
  patchImm5409 as patchImm5409Shared,
  patchImm5475 as patchImm5475Shared,
  patchImm5476 as patchImm5476Shared,
  patchImm5707 as patchImm5707Shared,
  primaryBag,
  ymd,
  type CompanionAnswers,
} from "./patch-companions";

export type KitAnswers = CompanionAnswers & {
  email: string;
  formLanguage: "e" | "f";
  forms: string[];
  schoolName?: string;
  schoolAddress?: string;
  needsCustodian?: boolean;
  custodianFamilyName?: string;
  custodianGivenName?: string;
  custodianDob?: string;
  custodianStatus?: string;
  custodianAddress?: string;
  custodianTelephone?: string;
  parent1Telephone?: string;
  parent2Telephone?: string;
};

export function patchImm5707(xml: string, a: KitAnswers): string {
  return patchImm5707Shared(xml, a, { defaultOccupation: "Student" });
}

export function patchImm5476(xml: string, a: KitAnswers): string {
  return patchImm5476Shared(xml, a, { applicationLabel: "Study permit" });
}

export function patchImm5475(xml: string, a: KitAnswers): string {
  return patchImm5475Shared(xml, a);
}

export function patchImm5409(xml: string, a: KitAnswers): string {
  return patchImm5409Shared(xml, a);
}

/** IMM 5646 — Custodianship declaration (minors only). */
export function patchImm5646(xml: string, a: KitAnswers): string {
  let out = xml;
  const b = primaryBag(a);
  const studentAddr = ascii(mailingAddress(a), 200);
  const schoolAddr = ascii(
    String(b.schoolAddress || a.schoolAddress || a.schoolName || ""),
    200,
  );
  const fillStudentBlock = (x: string) => {
    let o = x;
    o = setEmptyTag(o, "FamilyName", ascii(a.familyName));
    o = setEmptyTag(o, "GivenNames", ascii(a.givenName));
    if (a.citizenship) o = setEmptyTag(o, "Citizenship", ascii(a.citizenship));
    o = setEmptyTag(o, "theDate", ymd(a));
    if (schoolAddr) o = setEmptyTag(o, "schoolAddress", schoolAddr);
    if (a.sex === "Male" || a.sex === "Female") {
      o = setEmptyTag(o, "mfGroup", a.sex === "Male" ? "M" : "F");
    }
    if (studentAddr) o = setEmptyTag(o, "studentAddress", studentAddr);
    return o;
  };

  out = fillStudentBlock(out);
  if (a.parent1FamilyName) {
    out = setEmptyTag(out, "parentFamilyName", ascii(a.parent1FamilyName));
    out = setEmptyTag(out, "parentGivenNames", ascii(a.parent1GivenName));
    if (a.parent1Dob) out = setEmptyTag(out, "theDate", ascii(a.parent1Dob, 20));
    out = setEmptyTag(
      out,
      "parentAddress",
      ascii(a.parent1Address || studentAddr, 200),
    );
    if (a.parent1Telephone) {
      out = setEmptyTag(out, "parentTelephone", ascii(a.parent1Telephone, 40));
    }
  }
  if (a.parent2FamilyName) {
    out = setEmptyTag(out, "parentFamilyName", ascii(a.parent2FamilyName));
    out = setEmptyTag(out, "parentGivenNames", ascii(a.parent2GivenName || ""));
    if (a.parent2Dob) out = setEmptyTag(out, "theDate", ascii(a.parent2Dob, 20));
    out = setEmptyTag(
      out,
      "parentAddress",
      ascii(a.parent2Address || studentAddr, 200),
    );
    if (a.parent2Telephone) {
      out = setEmptyTag(out, "parentTelephone", ascii(a.parent2Telephone, 40));
    }
  }

  if (a.custodianFamilyName) {
    out = setEmptyTag(out, "FamilyName", ascii(a.custodianFamilyName));
    out = setEmptyTag(out, "GivenNames", ascii(a.custodianGivenName));
    if (a.custodianStatus) {
      out = setEmptyTag(out, "statusGroup", ascii(a.custodianStatus, 40));
    }
    if (a.custodianDob) out = setEmptyTag(out, "theDate", ascii(a.custodianDob, 20));
    if (a.custodianAddress) {
      out = setEmptyTag(out, "Address", ascii(a.custodianAddress, 200));
    }
    if (a.custodianTelephone) {
      out = setEmptyTag(out, "Telephone", ascii(a.custodianTelephone, 40));
    }
    out = setEmptyTag(
      out,
      "nameCustodian",
      ascii(`${a.custodianGivenName || ""} ${a.custodianFamilyName}`.trim()),
    );
  }
  out = setEmptyTag(
    out,
    "nameStudent",
    ascii(`${a.givenName} ${a.familyName}`.trim()),
  );
  if (a.parent1FamilyName) {
    out = setEmptyTag(
      out,
      "nameParent1",
      ascii(`${a.parent1GivenName || ""} ${a.parent1FamilyName}`.trim()),
    );
  }
  if (a.parent2FamilyName) {
    out = setEmptyTag(
      out,
      "nameParent2",
      ascii(`${a.parent2GivenName || ""} ${a.parent2FamilyName}`.trim()),
    );
  }
  if (a.city) out = setEmptyTag(out, "swornCity", ascii(a.city));
  if (a.provinceState) out = setEmptyTag(out, "swornProv", ascii(a.provinceState, 40));
  if (a.country) out = setEmptyTag(out, "swornCountry", ascii(a.country));
  const now = new Date();
  out = setEmptyTag(out, "swornDay", String(now.getDate()).padStart(2, "0"));
  out = setEmptyTag(out, "swornMonth", String(now.getMonth() + 1).padStart(2, "0"));
  out = setEmptyTag(out, "swornYear", String(now.getFullYear()));

  out = fillStudentBlock(out);
  return out;
}

export function patchImm5483(xml: string, a: KitAnswers): string {
  const selected = new Set(a.forms.map((f) => f.toLowerCase()));
  let out = xml.replace(
    /<formsList\n>([\s\S]*?)<\/formsList\n>/,
    (block) => {
      let b = block;
      b = setCheckbox(b, "s1", selected.has("imm1294"));
      b = setCheckbox(b, "s2", selected.has("imm5707") || selected.has("imm5646"));
      b = setCheckbox(b, "s3", selected.has("imm5476"));
      b = setCheckbox(b, "s4", selected.has("imm5475"));
      b = setCheckbox(b, "s5", selected.has("imm5409"));
      b = setCheckbox(b, "s6", selected.has("imm5646"));
      return b;
    },
  );
  out = out.replace(
    /<documentsList\n>([\s\S]*?)<\/documentsList\n>/,
    (block) => {
      let b = block;
      for (const key of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]) {
        b = setCheckbox(b, key, true);
      }
      return b;
    },
  );
  return out;
}

export function selectForms(input: {
  hasRepresentative?: boolean;
  hasDesignee?: boolean;
  isCommonLaw?: boolean;
  needsCustodian?: boolean;
  /** @deprecated use needsCustodian; kept for older drafts */
  includeImm5707?: boolean;
}): string[] {
  // IMM 5476 always — consultant represents the client in MyConsultant.
  const forms = ["imm1294", "imm5707", "imm5483", "imm5476"];
  if (input.hasDesignee) forms.push("imm5475");
  if (input.isCommonLaw) forms.push("imm5409");
  if (input.needsCustodian) forms.push("imm5646");
  return forms;
}
