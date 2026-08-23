/**
 * Permanent residence and citizenship form patchers (IMM 0008, 1344, 5562, CIT 0002).
 * IMM 5669 uses template-only XFA (no datasets stream) — filled as blank PDF for now.
 */
import type { CompanionAnswers } from "./patch-companions";
import { ascii } from "./patch-companions";
import {
  mapForm1,
  mapInner,
  setEmptyTag,
  setTag,
} from "./xfa-incremental";

type Bag = CompanionAnswers & Record<string, unknown>;

function yn(value: unknown): "Y" | "N" {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "TRUE" || v === "1") return "Y";
  return "N";
}

function bag(a: CompanionAnswers): Bag {
  return a as Bag;
}

function patchIdentityBlock(
  xml: string,
  a: CompanionAnswers,
  familyTag = "FamilyName",
  givenTag = "GivenName",
): string {
  const b = bag(a);
  let out = xml;
  out = setEmptyTag(out, familyTag, ascii(a.familyName));
  out = setEmptyTag(out, givenTag, ascii(a.givenName));
  if (a.dobYear) out = setTag(out, "DOBYYYY", ascii(a.dobYear, 4));
  if (a.dobMonth) out = setTag(out, "DOBMM", ascii(a.dobMonth, 2));
  if (a.dobDay) out = setTag(out, "DOBDD", ascii(a.dobDay, 2));
  if (a.dobYear) out = setTag(out, "DOBYear", ascii(a.dobYear, 4));
  if (a.dobMonth) out = setTag(out, "DOBMonth", ascii(a.dobMonth, 2));
  if (a.dobDay) out = setTag(out, "DOBDay", ascii(a.dobDay, 2));
  if (a.sex) {
    out = setTag(out, "Sex", ascii(a.sex, 20));
    out = setTag(out, "gender", ascii(a.sex, 20));
  }
  if (a.citizenship) out = setEmptyTag(out, "Citizenship1", ascii(a.citizenship, 4));
  if (b.citizenship2) out = setEmptyTag(out, "Citizenship2", ascii(String(b.citizenship2), 4));
  if (a.placeBirthCity) out = setEmptyTag(out, "PlaceBirthCity", ascii(a.placeBirthCity));
  if (a.placeBirthCountry) {
    out = setEmptyTag(out, "PlaceBirthCountry", ascii(a.placeBirthCountry, 4));
    out = setEmptyTag(out, "birthCountry", ascii(a.placeBirthCountry, 4));
  }
  if (a.maritalStatus) out = setTag(out, "MaritalStatus", ascii(a.maritalStatus, 4));
  if (b.uci) out = setEmptyTag(out, "UCI", ascii(String(b.uci), 20));
  if (b.heightCm) {
    out = setEmptyTag(out, "heightCM", ascii(String(b.heightCm), 3));
  }
  if (b.eyeColor) {
    out = setTag(out, "eyeColor", ascii(String(b.eyeColor), 4));
    out = setTag(out, "eyeColour", ascii(String(b.eyeColor), 4));
  }
  if (String(b.hasAlias || "").toUpperCase() === "Y") {
    out = setTag(out, "AliasNameIndicator", "Y");
    if (b.aliasFamilyName) {
      out = setEmptyTag(out, "AliasFamilyName", ascii(String(b.aliasFamilyName)));
    }
    if (b.aliasGivenName) {
      out = setEmptyTag(out, "AliasGivenName", ascii(String(b.aliasGivenName)));
    }
  }
  return out;
}

function patchMailingAddress(xml: string, a: CompanionAnswers): string {
  let out = xml;
  if (a.streetNum) out = setTag(out, "StreetNum", ascii(a.streetNum));
  if (a.streetName) {
    out = setTag(out, "Streetname", ascii(a.streetName));
    out = setTag(out, "StreetName", ascii(a.streetName));
  }
  if (a.city) out = setTag(out, "CityTown", ascii(a.city));
  if (a.provinceState) out = setTag(out, "ProvinceState", ascii(a.provinceState));
  if (a.country) out = setTag(out, "Country", ascii(a.country, 4));
  if (a.postalCode) out = setTag(out, "PostalCode", ascii(a.postalCode));
  if (a.emailContact || a.email) {
    out = setEmptyTag(out, "Email", ascii(a.emailContact || a.email, 80));
    out = setEmptyTag(out, "email", ascii(a.emailContact || a.email, 80));
  }
  if (a.phone) {
    out = setEmptyTag(out, "PhoneNumber", ascii(a.phone, 20));
    out = setEmptyTag(out, "ActualNumber", ascii(a.phone, 20));
  }
  if (a.phoneCountryCode) {
    out = setEmptyTag(out, "NumberCountry", ascii(a.phoneCountryCode, 6));
  }
  return out;
}

/** IMM 0008 — Generic Application Form for Canada. */
export function patchImm0008(xml: string, a: CompanionAnswers): string {
  const b = bag(a);
  return mapForm1(xml, (form1) => {
    let out = form1;
    if (b.applyingProgram) {
      out = setEmptyTag(out, "Program", ascii(String(b.applyingProgram), 4));
    }
    if (b.applyingCategory) {
      out = setEmptyTag(out, "Category", ascii(String(b.applyingCategory), 4));
    }
    if (b.correspondenceLang) {
      out = setEmptyTag(
        out,
        "CorrespondenceLang",
        ascii(String(b.correspondenceLang), 20),
      );
    }
    if (b.interviewLang) {
      out = setEmptyTag(out, "InterviewLang", ascii(String(b.interviewLang), 20));
    }
    if (b.interpreterRequested) {
      out = setTag(out, "InterpreterRequested", yn(b.interpreterRequested));
    }
    out = mapInner(out, "PersonalDetails", (pd) => {
      let block = patchIdentityBlock(pd, a);
      if (b.dateLastEntry) {
        block = setEmptyTag(
          block,
          "DateLastEntry",
          ascii(String(b.dateLastEntry), 20),
        );
      }
      if (b.placeLastEntry) {
        block = setEmptyTag(block, "place", ascii(String(b.placeLastEntry)));
      }
      if (b.marriageDate) {
        block = setEmptyTag(
          block,
          "DateOfMarriage",
          ascii(String(b.marriageDate), 20),
        );
      }
      if (a.spouseFamilyName || a.spouseGivenName) {
        block = mapInner(block, "q14", (q14) => {
          let q = q14;
          q = setEmptyTag(q, "FamilyName", ascii(a.spouseFamilyName));
          q = setEmptyTag(q, "GivenName", ascii(a.spouseGivenName));
          return q;
        });
      }
      return block;
    });
    out = mapInner(out, "contactInformation", (ci) => patchMailingAddress(ci, a));
    return out;
  });
}

/** IMM 1344 — Sponsor / sponsorship agreement. */
export function patchImm1344(xml: string, a: CompanionAnswers): string {
  const b = bag(a);
  return mapForm1(xml, (form1) => {
    let out = form1;
    out = mapInner(out, "SponsorDetails", (block) => {
      let s = patchIdentityBlock(block, a);
      if (b.sponsorRelationship) {
        s = setEmptyTag(s, "Relationship", ascii(String(b.sponsorRelationship)));
      }
      if (b.statusInCanada) {
        s = setEmptyTag(s, "StatusInCan", ascii(String(b.statusInCanada), 4));
      }
      if (b.dateStatusInCanada) {
        s = setEmptyTag(s, "DateStatInCan", ascii(String(b.dateStatusInCanada), 20));
      }
      return s;
    });
    out = mapInner(out, "genDetails", (block) => patchIdentityBlock(block, a));
    out = setTag(out, "CanCitzInd", yn(b.sponsorIsCitizen));
    out = setTag(out, "ResideCanInd", yn(b.sponsorLivesInCanada));
    out = setTag(out, "LiveQC", yn(b.sponsorLivesInQuebec));
    out = setTag(out, "Over18Ind", yn(b.sponsorOver18));
    out = setTag(out, "PrevSponsored", yn(b.sponsorPrevSponsored));
    out = setTag(out, "SocialAssistInd", yn(b.sponsorOnSocialAssist));
    out = setTag(out, "BankruptInd", yn(b.sponsorBankrupt));
    out = patchMailingAddress(out, a);
    return out;
  });
}

/** CIT 0002 — Application for Canadian Citizenship (adults). */
export function patchCit0002(xml: string, a: CompanionAnswers): string {
  const b = bag(a);
  return mapInner(xml, "CIT_0002", (root) =>
    mapInner(root, "content", (content) => {
      let out = content;
      if (b.citizenshipLanguage || b.correspondenceLang) {
        out = setEmptyTag(
          out,
          "language",
          ascii(String(b.citizenshipLanguage || b.correspondenceLang), 20),
        );
      }
      if (b.uci) out = setEmptyTag(out, "UCI", ascii(String(b.uci), 20));
      out = setTag(out, "accommodation", yn(b.needsAccommodation));
      if (b.accommodationType) {
        out = setEmptyTag(out, "accommodationType", ascii(String(b.accommodationType)));
      }
      out = mapInner(out, "q4", (q4) => {
        let block = q4;
        block = setEmptyTag(block, "familyName", ascii(a.familyName));
        block = setEmptyTag(block, "givenName", ascii(a.givenName));
        if (a.dobYear) block = setTag(block, "DOBYear", ascii(a.dobYear, 4));
        if (a.dobMonth) block = setTag(block, "DOBMonth", ascii(a.dobMonth, 2));
        if (a.dobDay) block = setTag(block, "DOBDay", ascii(a.dobDay, 2));
        if (a.sex) block = setTag(block, "gender", ascii(a.sex, 20));
        if (b.heightCm) block = setEmptyTag(block, "heightCM", ascii(String(b.heightCm), 3));
        if (b.eyeColor) block = setTag(block, "eyeColour", ascii(String(b.eyeColor), 4));
        if (a.placeBirthCountry) {
          block = setEmptyTag(block, "birthCountry", ascii(a.placeBirthCountry, 4));
        }
        return block;
      });
      if (b.eligibilityFrom) {
        out = setEmptyTag(out, "eligibilityFrom", ascii(String(b.eligibilityFrom), 20));
      }
      if (b.eligibilityTo) {
        out = setEmptyTag(out, "eligibilityTo", ascii(String(b.eligibilityTo), 20));
      }
      out = setTag(out, "calculatorUsed", yn(b.usedPresenceCalculator));
      out = setTag(out, "TaxesFiled", yn(b.taxesFiled));
      out = setTag(out, "NoSin", yn(b.hasSin) === "Y" ? "N" : "Y");
      if (b.sinNumber) out = setEmptyTag(out, "issuedNumber", ascii(String(b.sinNumber), 20));
      out = setTag(out, "PoliceCert", yn(b.policeCertificate));
      if (a.emailContact || a.email) {
        out = setEmptyTag(out, "Email", ascii(a.emailContact || a.email, 80));
        out = setEmptyTag(out, "email", ascii(a.emailContact || a.email, 80));
      }
      out = patchMailingAddress(out, a);
      return out;
    }),
  );
}

type TravelRow = Record<string, unknown>;

/** IMM 5562 — Supplementary travel information. */
export function patchImm5562(xml: string, a: CompanionAnswers): string {
  const b = bag(a);
  const rows = (
    Array.isArray(b.previousTravelRows)
      ? b.previousTravelRows
      : Array.isArray(a.primary?.previousCorRows)
        ? a.primary.previousCorRows
        : Array.isArray(b.previousCorRows)
          ? b.previousCorRows
          : []
  ) as TravelRow[];

  let out = xml;
  out = setEmptyTag(out, "FamilyName", ascii(a.familyName));
  out = setEmptyTag(out, "GivenNames", ascii(a.givenName));
  for (const row of rows.slice(0, 10)) {
    const from = String(row.from ?? row.fromDate ?? "").slice(0, 10);
    const to = String(row.to ?? row.toDate ?? "").slice(0, 10);
    const country = ascii(String(row.country ?? row.destination ?? row.location ?? ""), 80);
    const purpose = ascii(String(row.purpose ?? ""), 80);
    const details = ascii(String(row.details ?? ""), 200);
    if (!from && !to && !country) continue;
    out = setEmptyTag(out, "fromDate", from);
    out = setEmptyTag(out, "toDate", to);
    out = setEmptyTag(out, "Destination", country || from);
    if (purpose) out = setEmptyTag(out, "PurposeofTravel", purpose);
    if (details) out = setEmptyTag(out, "Details", details);
  }
  return out;
}
