/**
 * Shared companion IRCC form patchers used across permit kits:
 * IMM 5707 / 5645 (family info), 5476 (representative), 5475 (designee), 5409 (common-law).
 *
 * Checklist patchers and primary application fillers stay kit-local.
 */
import {
  setEmptyTag,
} from "./xfa-incremental";

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
  return `${a.dobYear}-${a.dobMonth.padStart(2, "0")}-${a.dobDay.padStart(2, "0")}`;
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

export function ascii(s: string | undefined, max = 120): string {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, max);
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

export function mailingAddress(a: CompanionAnswers): string {
  return [a.streetNum, a.streetName, a.city, a.provinceState, a.country, a.postalCode]
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
  ) || (opts.defaultOccupation || "Applicant");
  const address = ascii(mailingAddress(a), 200);

  out = setEmptyTag(out, "FamilyName", ascii(a.familyName));
  out = setEmptyTag(out, "GivenNames", ascii(a.givenName));
  out = setEmptyTag(out, "DOB", ymd(a));
  out = setEmptyTag(out, "COB", ascii(a.placeBirthCountry || a.citizenship));
  out = setEmptyTag(out, "MaritalStatus", maritalLabel(marital));
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
    out = setEmptyTag(out, "COB", ascii(a.spouseCob || a.citizenship));
    out = setEmptyTag(out, "Address", ascii(a.spouseAddress || address, 200));
    out = setEmptyTag(out, "MaritalStatus", maritalLabel(marital));
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
    out = setEmptyTag(out, "COB", ascii(a.parent1Cob || a.placeBirthCountry));
    out = setEmptyTag(out, "Address", ascii(a.parent1Address || address, 200));
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalLabel(a.parent1MaritalStatus || "01"),
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
    out = setEmptyTag(out, "COB", ascii(a.parent2Cob || a.placeBirthCountry));
    out = setEmptyTag(out, "Address", ascii(a.parent2Address || address, 200));
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalLabel(a.parent2MaritalStatus || "01"),
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
      if (child.cob) out = setEmptyTag(out, "COB", ascii(String(child.cob)));
      out = setEmptyTag(out, "Address", ascii(String(child.address || address), 200));
      out = setEmptyTag(out, "MaritalStatus", "Single");
      out = setEmptyTag(
        out,
        "Occupation",
        ascii(String(child.occupation || child.relationship || "Child"), 80),
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

/**
 * IMM 5645 — Family Information for visitors, students and workers (outside Canada).
 * Section A: applicant, spouse, parents. B: children. C: siblings.
 */
export function patchImm5645(xml: string, a: CompanionAnswers): string {
  let out = xml;
  const b = primaryBag(a);
  const marital = String(b.maritalStatus || a.maritalStatus || "02");
  const address = ascii(mailingAddress(a), 200) || "N/A";
  const email = ascii(a.emailContact || a.email || String(b.email || ""), 80);

  out = setEmptyTag(out, "FamilyName", ascii(a.familyName));
  out = setEmptyTag(out, "GivenNames", ascii(a.givenName));
  out = setEmptyTag(out, "DOB", ymd(a));
  out = setEmptyTag(out, "COB", ascii(a.placeBirthCountry || a.citizenship) || "N/A");
  out = setEmptyTag(out, "Address", address);
  out = setEmptyTag(out, "MaritalStatus", maritalLabel(marital));
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
    hasSpouse ? na(ascii(a.spouseCob || a.citizenship)) : "N/A",
  );
  out = setEmptyTag(
    out,
    "Address",
    hasSpouse ? na(ascii(a.spouseAddress || address, 200)) : "N/A",
  );
  out = setEmptyTag(
    out,
    "MaritalStatus",
    hasSpouse ? maritalLabel(marital) : "N/A",
  );
  if (hasSpouse && email) out = setEmptyTag(out, "Email", email);

  out = setEmptyTag(out, "FamilyName", na(a.parent1FamilyName));
  out = setEmptyTag(out, "GivenNames", na(a.parent1GivenName));
  out = setEmptyTag(out, "DOB", na(a.parent1Dob, "N/A"));
  out = setEmptyTag(out, "COB", na(a.parent1Cob || a.placeBirthCountry));
  out = setEmptyTag(out, "Address", na(ascii(a.parent1Address || address, 200)));
  out = setEmptyTag(
    out,
    "MaritalStatus",
    a.parent1FamilyName
      ? maritalLabel(a.parent1MaritalStatus || "01")
      : "N/A",
  );

  out = setEmptyTag(out, "FamilyName", na(a.parent2FamilyName));
  out = setEmptyTag(out, "GivenNames", na(a.parent2GivenName));
  out = setEmptyTag(out, "DOB", na(a.parent2Dob, "N/A"));
  out = setEmptyTag(out, "COB", na(a.parent2Cob || a.placeBirthCountry));
  out = setEmptyTag(out, "Address", na(ascii(a.parent2Address || address, 200)));
  out = setEmptyTag(
    out,
    "MaritalStatus",
    a.parent2FamilyName
      ? maritalLabel(a.parent2MaritalStatus || "01")
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
      ascii(String(child.relationship || "Child"), 40) || "Child",
    );
    out = setEmptyTag(out, "FamilyName", ascii(String(child.familyName || "")));
    out = setEmptyTag(out, "GivenNames", ascii(String(child.givenName || "")));
    if (child.dob) out = setEmptyTag(out, "DOB", ascii(String(child.dob), 20));
    out = setEmptyTag(out, "COB", ascii(String(child.cob || a.placeBirthCountry || "")));
    out = setEmptyTag(
      out,
      "Address",
      ascii(String(child.address || address), 200),
    );
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalLabel(String(child.maritalStatus || "02")),
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
      ascii(String(sibling.relationship || "Sibling"), 40) || "Sibling",
    );
    out = setEmptyTag(out, "FamilyName", ascii(String(sibling.familyName || "")));
    out = setEmptyTag(out, "GivenNames", ascii(String(sibling.givenName || "")));
    if (sibling.dob) out = setEmptyTag(out, "DOB", ascii(String(sibling.dob), 20));
    out = setEmptyTag(
      out,
      "COB",
      ascii(String(sibling.cob || a.placeBirthCountry || "")),
    );
    out = setEmptyTag(
      out,
      "Address",
      ascii(String(sibling.address || address), 200),
    );
    out = setEmptyTag(
      out,
      "MaritalStatus",
      maritalLabel(String(sibling.maritalStatus || "02")),
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
  if (a.repCountry) out = setEmptyTag(out, "country", ascii(a.repCountry));
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
  out = setEmptyTag(out, "Country", ascii(a.commonLawCountry || a.country || "Canada"));
  out = setEmptyTag(out, "Province", ascii(a.commonLawProvince || a.provinceState, 40));
  out = setEmptyTag(out, "FirstName", ascii(a.givenName));
  out = setEmptyTag(out, "SecondName", ascii(a.familyName));
  if (a.commonLawCity) out = setEmptyTag(out, "City", ascii(a.commonLawCity));
  if (a.commonLawProvince) {
    out = setEmptyTag(out, "Province", ascii(a.commonLawProvince, 40));
  }
  if (a.commonLawCountry) {
    out = setEmptyTag(out, "Country", ascii(a.commonLawCountry));
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
  if (a.partnerGivenName || a.partnerFamilyName) {
    out = setEmptyTag(
      out,
      "NamePartner",
      `${ascii(a.partnerGivenName)} ${ascii(a.partnerFamilyName)}`.trim(),
    );
  }
  if (a.commonLawCity) out = setEmptyTag(out, "City", ascii(a.commonLawCity));
  return out;
}
