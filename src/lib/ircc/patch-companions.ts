/**
 * Shared companion IRCC form patchers used across permit kits:
 * IMM 5707 / 5645 / 5406 (family info), 5476 (representative), 5475 (designee), 5409 (common-law).
 *
 * Checklist patchers and primary application fillers stay kit-local.
 */
import {
  mapInner,
  setEmptyTag,
  setFlag01,
  setTag,
} from "./xfa-incremental";
import { countryDisplayName } from "./codes/resolve-lic";

/** Fields needed by companion form patchers. */
export type CompanionAnswers = {
  familyName: string;
  givenName: string;
  sex?: string;
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  citizenship?: string;
  placeBirthCountry?: string;
  placeBirthCity?: string;
  maritalStatus?: string;
  occupation?: string;
  emailContact?: string;
  phone?: string;
  phoneCountryCode?: string;
  streetNum?: string;
  streetName?: string;
  city?: string;
  provinceState?: string;
  country?: string;
  postalCode?: string;
  /** Study primary bag */
  imm1294?: Record<string, unknown>;
  /** Work (and future) primary bag */
  primary?: Record<string, unknown>;
  jobTitle?: string;
  parent1FamilyName?: string;
  parent1GivenName?: string;
  parent1Dob?: string;
  parent1Cob?: string;
  parent1Address?: string;
  parent1MaritalStatus?: string;
  parent1Occupation?: string;
  parent2FamilyName?: string;
  parent2GivenName?: string;
  parent2Dob?: string;
  parent2Cob?: string;
  parent2Address?: string;
  parent2MaritalStatus?: string;
  parent2Occupation?: string;
  spouseFamilyName?: string;
  spouseGivenName?: string;
  spouseDob?: string;
  spouseCob?: string;
  spouseAddress?: string;
  spouseOccupation?: string;
  spouseAccompanying?: boolean;
  hasRepresentative?: boolean;
  repFamilyName?: string;
  repGivenName?: string;
  repOrganization?: string;
  repEmail?: string;
  repPhone?: string;
  repPhoneCountryCode?: string;
  repMembershipId?: string;
  repStreetNum?: string;
  repStreetName?: string;
  repCity?: string;
  repProvince?: string;
  repCountry?: string;
  repPostalCode?: string;
  hasDesignee?: boolean;
  designeeFamilyName?: string;
  designeeGivenName?: string;
  designeeRelationship?: string;
  isCommonLaw?: boolean;
  partnerGivenName?: string;
  partnerFamilyName?: string;
  yearsTogether?: string;
  commonLawCity?: string;
  commonLawProvince?: string;
  commonLawCountry?: string;
  commonLawStart?: string;
  custodianFamilyName?: string;
  custodianGivenName?: string;
  custodianDob?: string;
  custodianStatus?: string;
  custodianAddress?: string;
  custodianTelephone?: string;
  parent1Telephone?: string;
  parent2Telephone?: string;
  children?: Array<Record<string, unknown>>;
  siblings?: Array<Record<string, unknown>>;
  email?: string;
  formLanguage?: "e" | "f";
  forms?: string[];
};

export type PatchImm5707Options = {
  /** Fallback when occupation / jobTitle empty — e.g. "Student" / "Worker" */
  defaultOccupation?: string;
};

export type PatchImm5476Options = {
  /** Value for the "application" field — e.g. "Study permit" / "Work permit" */
  applicationLabel: string;
};

export function ymd(a: Pick<CompanionAnswers, "dobYear" | "dobMonth" | "dobDay">): string {
  const year = String(a.dobYear ?? "");
  if (!year) return "";
  const month = String(a.dobMonth ?? "").padStart(2, "0");
  const day = String(a.dobDay ?? "").padStart(2, "0");
  return [year, month !== "00" ? month : "", day !== "00" ? day : ""]
    .filter(Boolean)
    .join("-");
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

export function ascii(s: string | undefined, max = 120): string {
  return String(s || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function pdfFallback(a: CompanionAnswers, en: string, fr: string): string {
  return a.formLanguage === "f" ? fr : en;
}

function cob(a: CompanionAnswers, value: string | undefined): string {
  return countryDisplayName(String(value || ""), a.formLanguage);
}

export function maritalLabel(code: string | undefined): string {
  const map: Record<string, string> = {
    "01": "Married",
    "02": "Single",
    "03": "Common-law",
    "04": "Divorced",
    "05": "Separated",
    "06": "Widowed",
    "09": "Annulled marriage",
    "00": "Unknown",
  };
  const c = String(code || "").trim();
  return map[c] || c || "Single";
}

/** IMM 5707 marital-status `lic` codes (different from primary application forms). */
export function maritalCodeImm5707(code: string | undefined): string {
  const map: Record<string, string> = {
    "03": "1",
    "02": "2",
    "04": "3",
    "09": "4",
    "01": "5",
    "05": "6",
    "06": "7",
    "00": "8",
  };
  const c = String(code || "").trim();
  return map[c] || "2";
}

/** IMM 5645 / IMM 5406 marital-status `lic` codes. */
export function maritalCodeImm5645(code: string | undefined): string {
  const map: Record<string, string> = {
    "03": "1",
    "02": "2",
    "04": "3",
    "09": "4",
    "01": "5",
    "05": "7",
    "06": "8",
    "00": "9",
  };
  const c = String(code || "").trim();
  return map[c] || "2";
}

export function childRelationshipImm5707(value: string | undefined): string {
  const map: Record<string, string> = {
    son: "1",
    daughter: "2",
    stepDaughter: "3",
    stepSon: "4",
    adoptedDaughter: "5",
    adoptedSon: "6",
  };
  return map[String(value || "").trim()] || "";
}

export function childRelationshipImm5645(value: string | undefined): string {
  const map: Record<string, string> = {
    son: "1",
    daughter: "2",
    stepDaughter: "3",
    stepSon: "4",
    adoptedSon: "5",
    adoptedDaughter: "6",
  };
  return map[String(value || "").trim()] || "";
}

export function siblingRelationshipImm5645(value: string | undefined): string {
  const map: Record<string, string> = {
    brother: "1",
    sister: "2",
    stepBrother: "3",
    stepSister: "4",
    halfBrother: "5",
    halfSister: "6",
  };
  return map[String(value || "").trim()] || "";
}

export function mailingAddress(a: CompanionAnswers): string {
  return [
    a.streetNum,
    a.streetName,
    a.city,
    a.provinceState,
    cob(a, a.country),
    a.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function primaryBag(a: CompanionAnswers): Record<string, unknown> {
  return {
    ...(a as Record<string, unknown>),
    ...(a.imm1294 || {}),
    ...(a.primary || {}),
  };
}

function replaceXhtmlFamilyName(xml: string, value: string, occurrence = 0): string {
  let count = 0;
  return xml.replace(
    /<familyName\n><body[\s\S]*?<\/familyName\n>/g,
    (match) => {
      if (count++ !== occurrence) return match;
      return `<familyName\n>${ascii(value)}</familyName\n>`;
    },
  );
}

/** IMM 5707 — Family Information (temporary residence). */
export function patchImm5707(
  xml: string,
  a: CompanionAnswers,
  opts: PatchImm5707Options = {},
): string {
  let out = xml;
  const b = primaryBag(a);
  const marital = String(b.maritalStatus || a.maritalStatus || "02");
  const occupation = ascii(
    String(b.occupation || a.occupation || a.jobTitle || ""),
    80,
  ) || (opts.defaultOccupation || pdfFallback(a, "Applicant", "Demandeur"));
  const address = ascii(mailingAddress(a), 200);

  out = setEmptyTag(out, "FamilyName", ascii(a.familyName));
  out = setEmptyTag(out, "GivenNames", ascii(a.givenName));
  out = setEmptyTag(out, "DOB", ymd(a));
  out = setEmptyTag(out, "COB", ascii(cob(a, a.placeBirthCountry || a.citizenship)));
  out = setEmptyTag(out, "MaritalStatus", maritalCodeImm5707(marital));
  out = setEmptyTag(out, "Occupation", occupation);

  if (marital === "01" || marital === "03") {
    out = setEmptyTag(out, "yesno", "Y");
    const spouseFamily = ascii(a.spouseFamilyName || String(b.spouseFamilyName || ""));
    const spouseGiven = ascii(a.spouseGivenName || String(b.spouseGivenName || ""));
    out = setEmptyTag(out, "yesno", a.spouseAccompanying ? "Y" : "N");
    if (spouseFamily) out = setEmptyTag(out, "FamilyName", spouseFamily);
    if (spouseGiven) out = setEmptyTag(out, "GivenNames", spouseGiven);
    const sDob = ascii(
      a.spouseDob ||
        (b.spouseDobYear && b.spouseDobMonth && b.spouseDobDay
          ? `${b.spouseDobYear}-${String(b.spouseDobMonth).padStart(2, "0")}-${
            String(b.spouseDobDay).padStart(2, "0")
          }`
          : ""),
      20,
    );
    if (sDob) out = setEmptyTag(out, "DOB", sDob);
    out = setEmptyTag(out, "COB", ascii(cob(a, a.spouseCob || a.citizenship)));
    out = setEmptyTag(out, "Address", ascii(a.spouseAddress || address, 200));
    out = setEmptyTag(out, "MaritalStatus", maritalCodeImm5707(marital));
    out = setEmptyTag(
      out,
      "Occupation",
      ascii(a.spouseOccupation || "Partner", 80),
    );
  }

  if (a.parent1FamilyName) {
    out = setEmptyTag(out, "yesno", "N");
    out = setEmptyTag(out, "FamilyName", ascii(a.parent1FamilyName));
    out = setEmptyTag(out, "GivenNames", ascii(a.parent1GivenName));
    if (a.parent1Dob) out = setEmptyTag(out, "DOB", ascii(a.parent1Dob, 20));
    out = setEmptyTag(out, "COB", ascii(cob(a, a.parent1Cob || a.placeBirthCountry)));
    out = setEmptyTag(out, "Address", ascii(a.parent1Address || address, 200));
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalCodeImm5707(a.parent1MaritalStatus || "01"),
    );
    out = setEmptyTag(
      out,
      "Occupation",
      ascii(a.parent1Occupation || "Parent", 80),
    );
  }

  if (a.parent2FamilyName) {
    out = setEmptyTag(out, "yesno", "N");
    out = setEmptyTag(out, "FamilyName", ascii(a.parent2FamilyName));
    out = setEmptyTag(out, "GivenNames", ascii(a.parent2GivenName));
    if (a.parent2Dob) out = setEmptyTag(out, "DOB", ascii(a.parent2Dob, 20));
    out = setEmptyTag(out, "COB", ascii(cob(a, a.parent2Cob || a.placeBirthCountry)));
    out = setEmptyTag(out, "Address", ascii(a.parent2Address || address, 200));
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalCodeImm5707(a.parent2MaritalStatus || "01"),
    );
    out = setEmptyTag(
      out,
      "Occupation",
      ascii(a.parent2Occupation || "Parent", 80),
    );
  }

  out = out.replace(
    /<hideChildren\n>0<\/hideChildren\n>/,
    Array.isArray(a.children) && a.children.length > 0
      ? "<hideChildren\n>0</hideChildren\n>"
      : "<hideChildren\n>1</hideChildren\n>",
  );
  out = out.replace(
    /<hideChildren\n>1<\/hideChildren\n>/,
    Array.isArray(a.children) && a.children.length > 0
      ? "<hideChildren\n>0</hideChildren\n>"
      : "<hideChildren\n>1</hideChildren\n>",
  );

  if (Array.isArray(a.children)) {
    for (const child of a.children.slice(0, 8)) {
      const family = ascii(String(child.familyName || ""));
      const given = ascii(String(child.givenName || ""));
      if (!family && !given) continue;
      out = setEmptyTag(out, "yesno", child.accompanying === "Y" || child.accompanying === true ? "Y" : "N");
      if (family) out = setEmptyTag(out, "FamilyName", family);
      if (given) out = setEmptyTag(out, "GivenNames", given);
      if (child.dob) out = setEmptyTag(out, "DOB", ascii(String(child.dob), 20));
      if (child.cob) out = setEmptyTag(out, "COB", ascii(cob(a, String(child.cob))));
      out = setEmptyTag(out, "Address", ascii(String(child.address || address), 200));
      const childRel = childRelationshipImm5707(String(child.relationship || ""));
      if (childRel) out = setEmptyTag(out, "Relationship", childRel);
      out = setEmptyTag(out, "MaritalStatus", maritalCodeImm5707("02"));
      out = setEmptyTag(
        out,
        "Occupation",
        ascii(String(child.occupation || pdfFallback(a, "Child", "Enfant")), 80),
      );
    }
  }

  out = setEmptyTag(out, "SectionAdate", todayYmd());
  out = setEmptyTag(out, "SectionBdate", todayYmd());
  return out;
}

function na(value: string | undefined, fallback = "N/A"): string {
  return ascii(value) || fallback;
}

function irccFullName(family?: string, given?: string): string {
  const f = ascii(family);
  const g = ascii(given);
  if (f && g) return `${f}, ${g}`;
  return f || g;
}

function yn01(value: unknown, fallback = false): boolean {
  if (value === true || value === 1 || value === "1") return true;
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "Y" || v === "YES") return true;
  if (v === "N" || v === "NO" || v === "0") return false;
  return fallback;
}

/**
 * IMM 5645 — Family Information (outside Canada). Tags are AppName / SpouseName /
 * MotherName / ChildName, not the FamilyName layout used on IMM 5406 / 5707.
 */
export function patchImm5645(xml: string, a: CompanionAnswers): string {
  let out = xml;
  const b = primaryBag(a);
  const marital = String(b.maritalStatus || a.maritalStatus || "02");
  const address = ascii(mailingAddress(a), 200) || "N/A";
  const occupation =
    ascii(String(b.occupation || a.occupation || a.jobTitle || ""), 80) ||
    pdfFallback(a, "Applicant", "Demandeur");
  const codes = (a.forms ?? []).map((c) => c.toLowerCase());
  const isStudent = codes.some((c) => c === "imm1294" || c === "imm5709");
  const isWorker = codes.some((c) => c === "imm1295" || c === "imm5710");
  const isVisitor = codes.some(
    (c) => c === "imm5257" || c === "imm5708" || c === "imm5257sch1",
  );

  out = mapInner(out, "Subform1", (inner) => {
    let chunk = inner;
    chunk = setFlag01(chunk, "Visitor", isVisitor);
    chunk = setFlag01(chunk, "Worker", isWorker);
    chunk = setFlag01(chunk, "Student", isStudent);
    chunk = setFlag01(chunk, "Other", !isVisitor && !isWorker && !isStudent);
    return chunk;
  });

  out = mapInner(out, "Applicant", (inner) => {
    let chunk = inner;
    chunk = setTag(chunk, "AppName", irccFullName(a.familyName, a.givenName));
    chunk = setTag(chunk, "AppDOB", ymd(a));
    chunk = setTag(
      chunk,
      "AppCOB",
      ascii(cob(a, a.placeBirthCountry || a.citizenship)) || "N/A",
    );
    chunk = setTag(chunk, "AppAddress", address);
    chunk = setTag(chunk, "AppOccupation", occupation);
    chunk = setTag(chunk, "ChildMStatus", maritalCodeImm5645(marital));
    return chunk;
  });

  const hasSpouse = marital === "01" || marital === "03";
  const spouseFamily = ascii(
    a.spouseFamilyName || String(b.spouseFamilyName || a.partnerFamilyName || ""),
  );
  const spouseGiven = ascii(
    a.spouseGivenName || String(b.spouseGivenName || a.partnerGivenName || ""),
  );
  const sDob = ascii(
    a.spouseDob ||
      (b.spouseDobYear && b.spouseDobMonth && b.spouseDobDay
        ? `${b.spouseDobYear}-${String(b.spouseDobMonth).padStart(2, "0")}-${String(
            b.spouseDobDay,
          ).padStart(2, "0")}`
        : ""),
    20,
  );
  out = mapInner(out, "Spouse", (inner) => {
    let chunk = inner;
    chunk = setTag(
      chunk,
      "SpouseName",
      hasSpouse ? irccFullName(spouseFamily, spouseGiven) || "N/A" : "N/A",
    );
    chunk = setTag(chunk, "SpouseDOB", hasSpouse ? sDob || "N/A" : "N/A");
    chunk = setTag(
      chunk,
      "SpouseCOB",
      hasSpouse ? na(ascii(cob(a, a.spouseCob || a.citizenship))) : "N/A",
    );
    chunk = setTag(
      chunk,
      "SpouseAddress",
      hasSpouse ? na(ascii(a.spouseAddress || address, 200)) : "N/A",
    );
    chunk = setTag(
      chunk,
      "SpouseOccupation",
      hasSpouse ? ascii(a.spouseOccupation || "Partner", 80) : "N/A",
    );
    chunk = setFlag01(chunk, "SpouseYes", hasSpouse && Boolean(a.spouseAccompanying));
    chunk = setFlag01(chunk, "SpouseNo", hasSpouse && !a.spouseAccompanying);
    chunk = setTag(
      chunk,
      "ChildMStatus",
      hasSpouse ? maritalCodeImm5645(marital) : "N/A",
    );
    return chunk;
  });

  out = mapInner(out, "Mother", (inner) => {
    let chunk = inner;
    chunk = setTag(
      chunk,
      "MotherName",
      irccFullName(a.parent1FamilyName, a.parent1GivenName) || "N/A",
    );
    chunk = setTag(chunk, "MotherDOB", na(a.parent1Dob, "N/A"));
    chunk = setTag(
      chunk,
      "MotherCOB",
      na(cob(a, a.parent1Cob || a.placeBirthCountry)),
    );
    chunk = setTag(
      chunk,
      "MotherAddress",
      na(ascii(a.parent1Address || address, 200)),
    );
    chunk = setTag(
      chunk,
      "MotherOccupation",
      ascii(a.parent1Occupation || "Parent", 80) || "N/A",
    );
    chunk = setFlag01(chunk, "MotherYes", false);
    chunk = setFlag01(chunk, "MotherNo", true);
    chunk = setTag(
      chunk,
      "ChildMStatus",
      a.parent1FamilyName
        ? maritalCodeImm5645(a.parent1MaritalStatus || "01")
        : "N/A",
    );
    return chunk;
  });

  out = mapInner(out, "Father", (inner) => {
    let chunk = inner;
    chunk = setTag(
      chunk,
      "FatherName",
      irccFullName(a.parent2FamilyName, a.parent2GivenName) || "N/A",
    );
    chunk = setTag(chunk, "FatherDOB", na(a.parent2Dob, "N/A"));
    chunk = setTag(
      chunk,
      "FatherCOB",
      na(cob(a, a.parent2Cob || a.placeBirthCountry)),
    );
    chunk = setTag(
      chunk,
      "FatherAddress",
      na(ascii(a.parent2Address || address, 200)),
    );
    chunk = setTag(
      chunk,
      "FatherOccupation",
      ascii(a.parent2Occupation || "Parent", 80) || "N/A",
    );
    chunk = setFlag01(chunk, "FatherYes", false);
    chunk = setFlag01(chunk, "FatherNo", true);
    chunk = setTag(
      chunk,
      "ChildMStatus",
      a.parent2FamilyName
        ? maritalCodeImm5645(a.parent2MaritalStatus || "01")
        : "N/A",
    );
    return chunk;
  });

  const children = Array.isArray(a.children)
    ? a.children.filter((c) => c.familyName || c.givenName)
    : [];
  let childIndex = 0;
  out = mapInner(out, "SectionB", (section) =>
    section.replace(/<Child\n>[\s\S]*?<\/Child\n>/g, (block) => {
    if (!block.includes("<ChildName")) return block;
    const child = children[childIndex++];
    if (!child) return block;
    let chunk = block;
    chunk = setTag(
      chunk,
      "ChildName",
      irccFullName(String(child.familyName || ""), String(child.givenName || "")),
    );
    chunk = setTag(
      chunk,
      "ChildMStatus",
      maritalCodeImm5645(String(child.maritalStatus || "02")),
    );
    chunk = setTag(
      chunk,
      "ChildRelationship",
      childRelationshipImm5645(String(child.relationship || "")) ||
        ascii(String(child.relationship || "Child"), 40),
    );
    if (child.dob) chunk = setTag(chunk, "ChildDOB", ascii(String(child.dob), 20));
    chunk = setTag(
      chunk,
      "ChildCOB",
      ascii(cob(a, String(child.cob || a.placeBirthCountry || ""))),
    );
    chunk = setTag(
      chunk,
      "ChildAddress",
      ascii(String(child.address || address), 200),
    );
    chunk = setTag(
      chunk,
      "ChildOccupation",
      ascii(String(child.occupation || pdfFallback(a, "Child", "Enfant")), 80),
    );
    const acc = yn01(child.accompanying);
    chunk = setFlag01(chunk, "ChildYes", acc);
    chunk = setFlag01(chunk, "ChildNo", !acc);
    return chunk;
  }),
  );

  const siblings = Array.isArray(a.siblings)
    ? a.siblings.filter((s) => s.familyName || s.givenName)
    : [];
  // Section C reuses Child* tags after Section B children are consumed.
  out = mapInner(out, "SectionC", (section) => {
    let siblingIndex = 0;
    return section.replace(/<Child\n>[\s\S]*?<\/Child\n>/g, (block) => {
      const sibling = siblings[siblingIndex++];
      if (!sibling) return block;
      let chunk = block;
      chunk = setTag(
        chunk,
        "ChildName",
        irccFullName(
          String(sibling.familyName || ""),
          String(sibling.givenName || ""),
        ),
      );
      chunk = setTag(
        chunk,
        "ChildMStatus",
        maritalCodeImm5645(String(sibling.maritalStatus || "02")),
      );
      chunk = setTag(
        chunk,
        "ChildRelationship",
        siblingRelationshipImm5645(String(sibling.relationship || "")) ||
          ascii(String(sibling.relationship || "Sibling"), 40),
      );
      if (sibling.dob) {
        chunk = setTag(chunk, "ChildDOB", ascii(String(sibling.dob), 20));
      }
      chunk = setTag(
        chunk,
        "ChildCOB",
        ascii(cob(a, String(sibling.cob || a.placeBirthCountry || ""))),
      );
      chunk = setTag(
        chunk,
        "ChildAddress",
        ascii(String(sibling.address || address), 200),
      );
      chunk = setTag(
        chunk,
        "ChildOccupation",
        ascii(String(sibling.occupation || ""), 80),
      );
      chunk = setFlag01(chunk, "ChildYes", false);
      chunk = setFlag01(chunk, "ChildNo", true);
      return chunk;
    });
  });

  out = setEmptyTag(out, "SectionAdate", todayYmd());
  out = setEmptyTag(out, "SectionBdate", todayYmd());
  out = setEmptyTag(out, "SectionCdate", todayYmd());
  return out;
}

/**
 * IMM 5406 — additional family information (visitor visa). Same FamilyName /
 * GivenNames layout as IMM 5707, plus siblings.
 */
export function patchImm5406(xml: string, a: CompanionAnswers): string {
  let out = xml;
  const b = primaryBag(a);
  const marital = String(b.maritalStatus || a.maritalStatus || "02");
  const address = ascii(mailingAddress(a), 200) || "N/A";
  const email = ascii(a.emailContact || a.email || String(b.email || ""), 80);

  out = setEmptyTag(out, "FamilyName", ascii(a.familyName));
  out = setEmptyTag(out, "GivenNames", ascii(a.givenName));
  out = setEmptyTag(out, "DOB", ymd(a));
  out = setEmptyTag(out, "COB", ascii(cob(a, a.placeBirthCountry || a.citizenship)) || "N/A");
  out = setEmptyTag(out, "Address", address);
  out = setEmptyTag(out, "MaritalStatus", maritalCodeImm5645(marital));
  if (email) out = setEmptyTag(out, "Email", email);

  const hasSpouse = marital === "01" || marital === "03";
  const spouseFamily = ascii(
    a.spouseFamilyName ||
      String(b.spouseFamilyName || a.partnerFamilyName || ""),
  );
  const spouseGiven = ascii(
    a.spouseGivenName ||
      String(b.spouseGivenName || a.partnerGivenName || ""),
  );
  out = setEmptyTag(out, "FamilyName", hasSpouse ? na(spouseFamily) : "N/A");
  out = setEmptyTag(out, "GivenNames", hasSpouse ? na(spouseGiven) : "N/A");
  const sDob = ascii(
    a.spouseDob ||
      (b.spouseDobYear && b.spouseDobMonth && b.spouseDobDay
        ? `${b.spouseDobYear}-${String(b.spouseDobMonth).padStart(2, "0")}-${String(
            b.spouseDobDay,
          ).padStart(2, "0")}`
        : ""),
    20,
  );
  out = setEmptyTag(out, "DOB", hasSpouse ? na(sDob) : "N/A");
  out = setEmptyTag(
    out,
    "COB",
    hasSpouse ? na(ascii(cob(a, a.spouseCob || a.citizenship))) : "N/A",
  );
  out = setEmptyTag(
    out,
    "Address",
    hasSpouse ? na(ascii(a.spouseAddress || address, 200)) : "N/A",
  );
  out = setEmptyTag(
    out,
    "MaritalStatus",
    hasSpouse ? maritalCodeImm5645(marital) : "N/A",
  );
  if (hasSpouse && email) out = setEmptyTag(out, "Email", email);

  out = setEmptyTag(out, "FamilyName", na(a.parent1FamilyName));
  out = setEmptyTag(out, "GivenNames", na(a.parent1GivenName));
  out = setEmptyTag(out, "DOB", na(a.parent1Dob, "N/A"));
  out = setEmptyTag(out, "COB", na(cob(a, a.parent1Cob || a.placeBirthCountry)));
  out = setEmptyTag(out, "Address", na(ascii(a.parent1Address || address, 200)));
  out = setEmptyTag(
    out,
    "MaritalStatus",
    a.parent1FamilyName
      ? maritalCodeImm5645(a.parent1MaritalStatus || "01")
      : "N/A",
  );

  out = setEmptyTag(out, "FamilyName", na(a.parent2FamilyName));
  out = setEmptyTag(out, "GivenNames", na(a.parent2GivenName));
  out = setEmptyTag(out, "DOB", na(a.parent2Dob, "N/A"));
  out = setEmptyTag(out, "COB", na(cob(a, a.parent2Cob || a.placeBirthCountry)));
  out = setEmptyTag(out, "Address", na(ascii(a.parent2Address || address, 200)));
  out = setEmptyTag(
    out,
    "MaritalStatus",
    a.parent2FamilyName
      ? maritalCodeImm5645(a.parent2MaritalStatus || "01")
      : "N/A",
  );

  const children = Array.isArray(a.children)
    ? a.children.filter((c) => c.familyName || c.givenName)
    : [];
  out = out.replace(
    /<hideChildren\n>[01]<\/hideChildren\n>/,
    children.length > 0
      ? "<hideChildren\n>0</hideChildren\n>"
      : "<hideChildren\n>1</hideChildren\n>",
  );
  for (const child of children.slice(0, 3)) {
    out = setEmptyTag(
      out,
      "Relationship",
      childRelationshipImm5645(String(child.relationship || "")) ||
        ascii(String(child.relationship || pdfFallback(a, "Child", "Enfant")), 40) ||
        pdfFallback(a, "Child", "Enfant"),
    );
    out = setEmptyTag(out, "FamilyName", ascii(String(child.familyName || "")));
    out = setEmptyTag(out, "GivenNames", ascii(String(child.givenName || "")));
    if (child.dob) out = setEmptyTag(out, "DOB", ascii(String(child.dob), 20));
    out = setEmptyTag(out, "COB", ascii(cob(a, String(child.cob || a.placeBirthCountry || ""))));
    out = setEmptyTag(
      out,
      "Address",
      ascii(String(child.address || address), 200),
    );
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalCodeImm5645(String(child.maritalStatus || "02")),
    );
    if (child.email) out = setEmptyTag(out, "Email", ascii(String(child.email), 80));
  }

  const siblings = Array.isArray(a.siblings)
    ? a.siblings.filter((s) => s.familyName || s.givenName)
    : [];
  out = out.replace(
    /<hideSiblings\n>[01]<\/hideSiblings\n>/,
    siblings.length > 0
      ? "<hideSiblings\n>0</hideSiblings\n>"
      : "<hideSiblings\n>1</hideSiblings\n>",
  );
  for (const sibling of siblings.slice(0, 3)) {
    out = setEmptyTag(
      out,
      "Relationship",
      siblingRelationshipImm5645(String(sibling.relationship || "")) ||
        ascii(
          String(sibling.relationship || pdfFallback(a, "Sibling", "Frere ou soeur")),
          40,
        ) ||
        pdfFallback(a, "Sibling", "Frere ou soeur"),
    );
    out = setEmptyTag(out, "FamilyName", ascii(String(sibling.familyName || "")));
    out = setEmptyTag(out, "GivenNames", ascii(String(sibling.givenName || "")));
    if (sibling.dob) out = setEmptyTag(out, "DOB", ascii(String(sibling.dob), 20));
    out = setEmptyTag(
      out,
      "COB",
      ascii(cob(a, String(sibling.cob || a.placeBirthCountry || ""))),
    );
    out = setEmptyTag(
      out,
      "Address",
      ascii(String(sibling.address || address), 200),
    );
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalCodeImm5645(String(sibling.maritalStatus || "02")),
    );
    if (sibling.email) {
      out = setEmptyTag(out, "Email", ascii(String(sibling.email), 80));
    }
  }

  out = setEmptyTag(out, "SignedDate", todayYmd());
  return out;
}

/** IMM 5476 — Use of a representative. */
export function patchImm5476(
  xml: string,
  a: CompanionAnswers,
  opts: PatchImm5476Options,
): string {
  let out = xml;
  const today = todayYmd();
  out = setEmptyTag(out, "RadioButtonList", "1");
  out = replaceXhtmlFamilyName(out, a.familyName, 0);
  out = setEmptyTag(out, "givenName", ascii(a.givenName));
  out = setEmptyTag(out, "DOB", ymd(a));
  out = setEmptyTag(out, "application", opts.applicationLabel);
  if (a.repFamilyName) {
    out = replaceXhtmlFamilyName(out, a.repFamilyName, 1);
    out = setEmptyTag(out, "givenName", ascii(a.repGivenName));
  }
  if (a.repOrganization) out = setEmptyTag(out, "organization", ascii(a.repOrganization));
  if (a.repMembershipId) {
    out = setEmptyTag(out, "membershipID", ascii(a.repMembershipId, 40));
  }
  if (a.repStreetNum) out = setEmptyTag(out, "streetNo", ascii(a.repStreetNum, 20));
  if (a.repStreetName) out = setEmptyTag(out, "streetName", ascii(a.repStreetName));
  if (a.repCity) out = setEmptyTag(out, "city", ascii(a.repCity));
  if (a.repProvince) out = setEmptyTag(out, "province", ascii(a.repProvince, 40));
  if (a.repCountry) out = setEmptyTag(out, "country", ascii(cob(a, a.repCountry)));
  if (a.repPostalCode) out = setEmptyTag(out, "postalcode", ascii(a.repPostalCode, 20));
  if (a.repPhoneCountryCode) {
    out = setEmptyTag(out, "phoneCountryCode", ascii(a.repPhoneCountryCode, 6));
  }
  if (a.repPhone) out = setEmptyTag(out, "phoneNumber", ascii(a.repPhone, 40));
  if (a.repEmail) out = setEmptyTag(out, "email", ascii(a.repEmail, 80));
  out = setEmptyTag(out, "dateSigned", today);
  out = setEmptyTag(out, "dateApplicantSigned", today);
  if (a.repFamilyName) {
    out = replaceXhtmlFamilyName(out, a.repFamilyName, 2);
    out = setEmptyTag(out, "givenName", ascii(a.repGivenName));
    if (a.repOrganization) {
      out = setEmptyTag(out, "organization", ascii(a.repOrganization));
    }
  }
  return out;
}

/** IMM 5475 — Authority to release personal information. */
export function patchImm5475(xml: string, a: CompanionAnswers): string {
  let out = xml;
  const today = todayYmd();
  out = setEmptyTag(out, "RadioButtonList", "1");
  out = setEmptyTag(out, "AppFamily", ascii(a.familyName));
  out = setEmptyTag(out, "AppGiven", ascii(a.givenName));
  out = setEmptyTag(out, "currentDate", ymd(a));
  if (a.designeeFamilyName) {
    if (a.designeeRelationship) {
      out = setEmptyTag(out, "TextField2", ascii(a.designeeRelationship));
    }
    out = setEmptyTag(out, "AppFamily", ascii(a.designeeFamilyName));
    out = setEmptyTag(out, "AppGiven", ascii(a.designeeGivenName || ""));
  }
  if (a.streetNum) out = setEmptyTag(out, "Number", ascii(a.streetNum, 20));
  if (a.streetName) out = setEmptyTag(out, "homeAddress", ascii(a.streetName));
  if (a.city) out = setEmptyTag(out, "city", ascii(a.city));
  if (a.provinceState) {
    out = setEmptyTag(out, "province", ascii(a.provinceState, 40));
  }
  if (a.postalCode) out = setEmptyTag(out, "postalCode", ascii(a.postalCode, 20));
  if (a.phone) out = setEmptyTag(out, "Rphone", ascii(a.phone, 40));
  out = setEmptyTag(out, "currentDate", today);
  return out;
}

/** IMM 5409 — Statutory declaration of common-law union. */
export function patchImm5409(xml: string, a: CompanionAnswers): string {
  let out = xml;
  out = setEmptyTag(out, "Country", ascii(cob(a, a.commonLawCountry || a.country || "Canada")));
  out = setEmptyTag(out, "Province", ascii(a.commonLawProvince || a.provinceState, 40));
  out = setEmptyTag(out, "FirstName", ascii(a.givenName));
  out = setEmptyTag(out, "SecondName", ascii(a.familyName));
  if (a.commonLawCity) out = setEmptyTag(out, "City", ascii(a.commonLawCity));
  if (a.commonLawProvince) {
    out = setEmptyTag(out, "Province", ascii(a.commonLawProvince, 40));
  }
  if (a.commonLawCountry) {
    out = setEmptyTag(out, "Country", ascii(cob(a, a.commonLawCountry)));
  }
  if (a.yearsTogether) {
    out = setEmptyTag(out, "YearsTogether", ascii(a.yearsTogether, 10));
  }
  if (a.commonLawStart) {
    out = setEmptyTag(out, "startDate", ascii(a.commonLawStart, 20));
  }
  out = setEmptyTag(out, "endDate", "Present");
  if (a.yearsTogether) {
    out = setEmptyTag(out, "yesno", "Y");
    out = setEmptyTag(out, "yesno", "Y");
  }
  out = setEmptyTag(out, "NameDecl", `${ascii(a.givenName)} ${ascii(a.familyName)}`);
  if (a.partnerGivenName || a.partnerFamilyName || a.spouseGivenName || a.spouseFamilyName) {
    out = setEmptyTag(
      out,
      "NamePartner",
      `${ascii(a.partnerGivenName || a.spouseGivenName)} ${ascii(a.partnerFamilyName || a.spouseFamilyName)}`.trim(),
    );
  }
  if (a.commonLawCity) out = setEmptyTag(out, "City", ascii(a.commonLawCity));
  return out;
}
