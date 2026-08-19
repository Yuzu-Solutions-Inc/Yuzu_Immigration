/**
 * Study-permit kit patchers — kit-local checklists + selectForms;
 * companions live in _shared/patch_companions.ts.
 */
import {
  mapInner,
  setCheckbox,
  setEmptyTag,
} from "./xfa-incremental";
import { applicationLabelForForms, occupationLabelForForms } from "./kits";
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
  return patchImm5707Shared(xml, a, {
    defaultOccupation: occupationLabelForForms(a.forms, a.formLanguage),
  });
}

export function patchImm5476(xml: string, a: KitAnswers): string {
  return patchImm5476Shared(xml, a, {
    applicationLabel: applicationLabelForForms(a.forms, a.formLanguage),
  });
}

export function patchImm5475(xml: string, a: KitAnswers): string {
  return patchImm5475Shared(xml, a);
}

export function patchImm5409(xml: string, a: KitAnswers): string {
  return patchImm5409Shared(xml, a);
}

/** IMM 5646 — Custodianship declaration (minors only). Page 1 and page 2 duplicate most fields. */
export function patchImm5646(xml: string, a: KitAnswers): string {
  const b = primaryBag(a);
  const studentAddr = ascii(mailingAddress(a), 200);
  const schoolAddr = ascii(
    String(b.schoolAddress || a.schoolAddress || a.schoolName || ""),
    200,
  );
  const studentName = ascii(`${a.givenName} ${a.familyName}`.trim());
  const parent1Name = ascii(
    `${a.parent1GivenName || ""} ${a.parent1FamilyName || ""}`.trim(),
  );
  const parent2Name = ascii(
    `${a.parent2GivenName || ""} ${a.parent2FamilyName || ""}`.trim(),
  );
  const custodianName = ascii(
    `${a.custodianGivenName || ""} ${a.custodianFamilyName || ""}`.trim(),
  );
  const now = new Date();

  const fillPage = (page: string, extras: boolean) => {
    let o = page;
    o = mapInner(o, "subStudentInfo", (block) => {
      let x = block;
      x = setEmptyTag(x, "FamilyName", ascii(a.familyName));
      x = setEmptyTag(x, "GivenNames", ascii(a.givenName));
      if (a.citizenship) x = setEmptyTag(x, "Citizenship", ascii(a.citizenship));
      x = setEmptyTag(x, "theDate", ymd(a));
      if (schoolAddr) x = setEmptyTag(x, "schoolAddress", schoolAddr);
      if (a.sex === "Male" || a.sex === "Female") {
        x = setEmptyTag(x, "mfGroup", a.sex === "Male" ? "M" : "F");
      }
      if (studentAddr) x = setEmptyTag(x, "studentAddress", studentAddr);
      return x;
    });

    let parentIndex = 0;
    o = o.replace(/<Parent\n>[\s\S]*?<\/Parent\n>/g, (block) => {
      const first = parentIndex === 0;
      parentIndex += 1;
      const family = first ? a.parent1FamilyName : a.parent2FamilyName;
      const given = first ? a.parent1GivenName : a.parent2GivenName;
      const dob = first ? a.parent1Dob : a.parent2Dob;
      const address = first ? a.parent1Address : a.parent2Address;
      const phone = first ? a.parent1Telephone : a.parent2Telephone;
      if (!family) return block;
      let x = block;
      x = setEmptyTag(x, "parentFamilyName", ascii(family));
      x = setEmptyTag(x, "parentGivenNames", ascii(given || ""));
      if (dob) x = setEmptyTag(x, "theDate", ascii(dob, 20));
      x = setEmptyTag(x, "parentAddress", ascii(address || studentAddr, 200));
      if (phone) x = setEmptyTag(x, "parentTelephone", ascii(phone, 40));
      return x;
    });

    o = mapInner(o, "subCustodian", (block) => {
      if (!a.custodianFamilyName) return block;
      let x = block;
      x = setEmptyTag(x, "FamilyName", ascii(a.custodianFamilyName));
      x = setEmptyTag(x, "GivenNames", ascii(a.custodianGivenName || ""));
      if (a.custodianStatus) {
        x = setEmptyTag(x, "statusGroup", ascii(a.custodianStatus, 40));
      }
      if (a.custodianDob) x = setEmptyTag(x, "theDate", ascii(a.custodianDob, 20));
      if (a.custodianAddress) {
        x = setEmptyTag(x, "Address", ascii(a.custodianAddress, 200));
      }
      if (a.custodianTelephone) {
        x = setEmptyTag(x, "Telephone", ascii(a.custodianTelephone, 40));
      }
      return x;
    });

    o = mapInner(o, "subDeclaration", (block) => {
      let x = block;
      if (custodianName) x = setEmptyTag(x, "nameCustodian", custodianName);
      if (studentName) x = setEmptyTag(x, "nameStudent", studentName);
      if (extras) {
        if (parent1Name) x = setEmptyTag(x, "nameParent1", parent1Name);
        if (parent2Name) x = setEmptyTag(x, "nameParent2", parent2Name);
        if (custodianName) x = setEmptyTag(x, "nameCust", custodianName);
      }
      if (a.city) x = setEmptyTag(x, "swornCity", ascii(a.city));
      if (a.provinceState) {
        x = setEmptyTag(x, "swornProv", ascii(a.provinceState, 40));
      }
      if (a.country) x = setEmptyTag(x, "swornCountry", ascii(a.country));
      x = setEmptyTag(x, "swornDay", String(now.getDate()).padStart(2, "0"));
      x = setEmptyTag(
        x,
        "swornMonth",
        String(now.getMonth() + 1).padStart(2, "0"),
      );
      x = setEmptyTag(x, "swornYear", String(now.getFullYear()));
      return x;
    });
    return o;
  };

  let out = mapInner(xml, "Page1", (page) => fillPage(page, false));
  out = mapInner(out, "Page2", (page) => fillPage(page, true));
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
  applicationLocation?: "outside" | "inside";
  hasRepresentative?: boolean;
  hasDesignee?: boolean;
  isCommonLaw?: boolean;
  needsCustodian?: boolean;
  /** @deprecated use needsCustodian; kept for older drafts */
  includeImm5707?: boolean;
}): string[] {
  const inside = input.applicationLocation === "inside";
  const forms = [
    inside ? "imm5709" : "imm1294",
    inside ? "imm5707" : "imm5645",
    "imm5476",
  ];
  if (input.hasDesignee) forms.push("imm5475");
  if (input.isCommonLaw) forms.push("imm5409");
  if (input.needsCustodian) forms.push("imm5646");
  return forms;
}
