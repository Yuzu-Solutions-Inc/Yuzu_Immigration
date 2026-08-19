/**
 * Fill local IRCC blanks from a complete questionnaire fixture and assert
 * decrypted XFA datasets contain the mapped values.
 *
 *   npx tsx scripts/verify-ircc-fill.ts
 */
import formMeta from "../src/lib/ircc/form-meta.json";
import { fillProjectForms } from "../src/lib/ircc/fill-project";
import { extractDatasetsXml, type FormMeta } from "../src/lib/ircc/xfa-incremental";

const FIXTURE: Record<string, unknown> = {
  formLanguage: "e",
  email: "amine.benali@example.com",
  familyName: "Benali",
  givenName: "Amine",
  sex: "Male",
  dob: "1998-03-15",
  placeBirthCity: "Casablanca",
  placeBirthCountry: "022",
  citizenship: "022",
  maritalStatus: "01",
  spouseFamilyName: "Benali",
  spouseGivenName: "Sara",
  marriageDate: "2022-06-01",
  spouseDob: "1999-08-20",
  spouseCob: "022",
  spouseOccupation: "Teacher",
  spouseAccompanying: "Y",
  nativeLang: "001",
  ableToCommunicate: "Both",
  preferredLang: "English",
  phoneCountryCode: "212",
  phone: "661234567",
  phoneType: "01",
  streetNum: "12",
  streetName: "Rue Atlas",
  aptUnit: "4B",
  city: "Casablanca",
  provinceState: "",
  country: "022",
  postalCode: "20000",
  sameAsMailing: "Y",
  currentCountry: "022",
  currentStatus: "01",
  passportNumber: "AB1234567",
  passportCountry: "022",
  passportIssue: "2022-01-10",
  passportExpiry: "2032-01-10",
  schoolName: "University of Waterloo",
  schoolAddress: "200 University Ave W",
  schoolCity: "Waterloo",
  schoolProvince: "ON",
  dli: "O19377235822",
  studentId: "20998877",
  studyLevel: "10",
  fieldOfStudy: "04",
  studyFrom: "2026-09-01",
  studyTo: "2028-04-30",
  tuitionAmount: "28000",
  roomBoard: "12000",
  otherStudyCosts: "2000",
  availableFunds: "45000",
  funds: "Parents",
  palNumber: "PAL-ON-9988",
  palExpiry: "2026-12-31",
  studyNeedsWorkPermit: "Y",
  studyWorkPermitType: "OWP",
  visaType: "Visitor",
  visitPurpose: "02",
  visitFrom: "2026-07-01",
  visitTo: "2026-08-15",
  visitHostName: "Nadia Tremblay",
  visitHostRelationship: "Aunt",
  visitHostAddress: "88 King St W, Toronto ON",
  visitHost2Name: "Omar Haddad",
  visitHost2Relationship: "Friend",
  visitHost2Address: "15 Queen St, Ottawa ON",
  visitFundsAmount: "8000",
  visitFunds: "Myself",
  visitorApplyExtend: "Y",
  visitorOrigEntryDate: "2025-09-01",
  visitorOrigEntryPlace: "Toronto Pearson",
  visitorRecentEntryDate: "2026-01-10",
  visitorRecentEntryPlace: "Montreal",
  visitorPrevDocNum: "V123456",
  employerName: "Maple Tech Inc",
  employerAddress: "100 King St W, Toronto",
  jobTitle: "Software developer",
  jobDescription: "Build internal tools",
  workPermitType: "LMOS",
  workProvince: "ON",
  workCity: "Toronto",
  workFrom: "2026-09-01",
  workTo: "2028-09-01",
  applyingExtend: "Y",
  origEntryDate: "2025-09-01",
  origEntryPlace: "Toronto Pearson",
  purposeOfVisit: "04",
  recentEntryDate: "2026-01-10",
  recentEntryPlace: "Montreal",
  prevDocNum: "W987654",
  parent1FamilyName: "Benali",
  parent1GivenName: "Hassan",
  parent1Dob: "1968-02-02",
  parent1Cob: "022",
  parent1Occupation: "Engineer",
  parent1Address: "12 Rue Atlas, Casablanca",
  parent1Telephone: "661111111",
  parent2FamilyName: "Benali",
  parent2GivenName: "Amina",
  parent2Dob: "1970-05-05",
  parent2Cob: "022",
  parent2Occupation: "Nurse",
  parent2Address: "12 Rue Atlas, Casablanca",
  parent2Telephone: "662222222",
  hasChildren: "Y",
  children: [
    {
      familyName: "Benali",
      givenName: "Youssef",
      dob: "2023-04-01",
      cob: "022",
      relationship: "son",
      accompanying: "Y",
      address: "12 Rue Atlas, Casablanca",
      occupation: "Child",
    },
  ],
  hasSiblings: "Y",
  siblings: [
    {
      familyName: "Benali",
      givenName: "Leila",
      relationship: "sister",
      dob: "2001-11-11",
      cob: "022",
      maritalStatus: "02",
      address: "12 Rue Atlas, Casablanca",
    },
  ],
  needsCustodian: "Y",
  custodianFamilyName: "Tremblay",
  custodianGivenName: "Nadia",
  custodianDob: "1975-01-01",
  custodianStatus: "Citizen",
  custodianAddress: "88 King St W, Toronto ON",
  custodianTelephone: "4165551212",
  jobs: [
    {
      occupation: "Student",
      employer: "University Hassan II",
      city: "Casablanca",
      country: "022",
      from: "2022-09",
      to: "2026-06",
    },
  ],
  educationIndicator: "Y",
  educationRows: [
    {
      school: "Lycee Ibn Battuta",
      fieldOfStudy: "Science",
      city: "Casablanca",
      country: "022",
      from: "2016-09",
      to: "2022-06",
    },
  ],
  bgMilitary: "Y",
  bgMilitaryDetails: "National service 2017",
  hasMembership: "Y",
  heldGovPosition: "N",
  traveledOtherCountry: "Y",
  militaryServiceRows: [
    {
      from: "2017-01",
      to: "2017-12",
      location: "Rabat",
      country: "022",
    },
  ],
  membershipRows: [
    {
      from: "2018-01",
      organization: "Student union",
      position: "Member",
      country: "022",
    },
  ],
  previousTravelRows: [
    {
      from: "2024-06",
      to: "2024-07",
      country: "511",
      location: "Montreal",
      purpose: "Tourism",
    },
  ],
  cicContactConsent: "Y",
  forms: ["imm1294", "imm5645", "imm5257", "imm5709"],
};

const CHECKS: Array<{
  code: string;
  lang?: "e" | "f";
  mustInclude: string[];
  mustNotInclude?: string[];
}> = [
  {
    code: "imm1294",
    mustInclude: ["Benali", "Amine", "3900", "4B", "28000", "12000", "2000"],
  },
  {
    code: "imm5645",
    mustInclude: ["AppName", "Benali, Amine", "Youssef", "Leila", "<Student\n>1"],
  },
  {
    code: "imm5709",
    mustInclude: ["DetailsOfStudy", "University of Waterloo", "StudentNo", "20998877", "Room"],
    mustNotInclude: ["NewEmployer"],
  },
  {
    code: "imm5257",
    mustInclude: ["PurposeOfVisit", "Nadia Tremblay", "8000", "Visitor"],
    mustNotInclude: ["O9999999"],
  },
  {
    code: "imm5708",
    mustInclude: ["DetailsOfVisit", "Nadia Tremblay", "FundsAvail", "8000"],
  },
  {
    code: "imm5257sch1",
    mustInclude: ["ServedInMilitary", "Benali", "Student union", "Montreal"],
  },
  {
    code: "imm5646",
    mustInclude: ["Tremblay", "Amine", "Hassan"],
  },
  {
    code: "imm5710",
    lang: "f",
    mustInclude: ["Benali", "Maple Tech", "Software developer"],
  },
  {
    code: "imm1295",
    mustInclude: ["Maple Tech", "Software developer", "DetailsOfIntendedWork"],
    mustNotInclude: ["O9999999"],
  },
];

async function main() {
  let failed = 0;
  for (const check of CHECKS) {
    const lang = check.lang ?? "e";
    const answers = {
      ...FIXTURE,
      formLanguage: lang,
    };
    try {
      const result = await fillProjectForms({
        instances: [
          {
            code: check.code,
            answers,
            projectFormCodes: [
              "imm1294",
              "imm5645",
              "imm5257",
              "imm5709",
              "imm5646",
              "imm5257sch1",
            ],
          },
        ],
      });
      for (const warning of result.warnings) {
        console.warn(`WARN  ${check.code}: ${warning}`);
      }
      const form = result.forms[0];
      if (!form) {
        failed += 1;
        console.error(`FAIL  ${check.code}: no filled PDF`);
        continue;
      }
      const key = `${check.code}${lang}`;
      const meta = (formMeta as Record<string, FormMeta>)[key];
      if (!meta) {
        failed += 1;
        console.error(`FAIL  Missing form-meta ${key}`);
        continue;
      }
      const xml = await extractDatasetsXml(form.bytes, meta);
      let checkFailed = false;
      for (const token of check.mustInclude) {
        if (!xml.includes(token)) {
          checkFailed = true;
          console.error(`FAIL  ${key} missing ${JSON.stringify(token)}`);
        }
      }
      for (const token of check.mustNotInclude ?? []) {
        if (xml.includes(token)) {
          checkFailed = true;
          console.error(`FAIL  ${key} unexpectedly contains ${JSON.stringify(token)}`);
        }
      }
      if (checkFailed) failed += 1;
      else console.log(`OK    ${key} (${xml.length} xml chars)`);
    } catch (error) {
      failed += 1;
      console.error(
        `FAIL  ${check.code}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll IRCC fill checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
