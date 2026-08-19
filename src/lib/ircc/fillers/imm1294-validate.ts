import type { Imm1294Answers } from "./imm1294";

const EMAIL_MAX_LENGTH = 254;
const TEXT_MAX = 120;

const SEX_VALUES = new Set(["Male", "Female", "Unknown", "Unspecified"]);
const COMMUNICATE_VALUES = new Set(["English", "French", "Both", "Neither"]);
const FUNDS_VALUES = new Set(["Myself", "Parents", "Other"]);
const MARITAL_VALUES = new Set(["01", "02", "03", "04", "05", "06", "00", "09"]);
const STATUS_VALUES = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
const PROVINCE_VALUES = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

function cleanText(value: unknown, max = TEXT_MAX) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function digits(value: unknown, len: number) {
  return String(value ?? "").replace(/\D/g, "").slice(0, len);
}
function parseYn(raw: unknown, fallback: "Y" | "N" = "N"): "Y" | "N" {
  const v = cleanText(raw, 8).toUpperCase();
  if (v === "Y" || v === "YES") return "Y";
  if (v === "N" || v === "NO") return "N";
  return fallback;
}

/** Optional MM — never emit "00" (empty padStart), which fails IRCC Valider. */
function optionalMonth(raw: unknown): string | undefined {
  const d = digits(raw, 2);
  if (!d) return undefined;
  const m = d.padStart(2, "0");
  const n = Number(m);
  if (n < 1 || n > 12) return undefined;
  return m;
}

function optionalYear(raw: unknown): string | undefined {
  const d = digits(raw, 4);
  return d.length === 4 ? d : undefined;
}

function optionalDay(raw: unknown): string | undefined {
  const d = digits(raw, 2);
  if (!d) return undefined;
  const day = d.padStart(2, "0");
  const n = Number(day);
  if (n < 1 || n > 31) return undefined;
  return day;
}

/** IRCC: To year/month are both optional, but if either is set both are required. */
function optionalYearMonth(
  yearRaw: unknown,
  monthRaw: unknown,
): { year?: string; month?: string; error?: string } {
  const year = optionalYear(yearRaw);
  const month = optionalMonth(monthRaw);
  if (year && month) return { year, month };
  if (!year && !month) return {};
  return { error: "Employment end date needs both year and month (or leave both blank if current)." };
}
export function validateAnswers(raw: Record<string, unknown>): { ok: true; answers: Imm1294Answers } | { ok: false; error: string } {
  const email = cleanText(raw.email, EMAIL_MAX_LENGTH).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const sex = cleanText(raw.sex, 20);
  if (!SEX_VALUES.has(sex)) return { ok: false, error: "Select a valid sex." };

  const ableToCommunicate = cleanText(raw.ableToCommunicate, 20);
  if (!COMMUNICATE_VALUES.has(ableToCommunicate)) {
    return { ok: false, error: "Select English/French communication ability." };
  }

  const funds = cleanText(raw.funds, 20);
  if (!FUNDS_VALUES.has(funds)) return { ok: false, error: "Select who pays your expenses." };

  const maritalStatus = cleanText(raw.maritalStatus, 2);
  if (!MARITAL_VALUES.has(maritalStatus)) return { ok: false, error: "Select a marital status." };

  const currentStatus = cleanText(raw.currentStatus, 2);
  if (!STATUS_VALUES.has(currentStatus)) {
    return { ok: false, error: "Select your status in your country of residence." };
  }

  const schoolProvince = cleanText(raw.schoolProvince, 2).toUpperCase();
  if (!PROVINCE_VALUES.has(schoolProvince)) {
    return { ok: false, error: "Select a Canadian province/territory for the school." };
  }

  const studyLevel = cleanText(raw.studyLevel, 2);
  if (!studyLevel) return { ok: false, error: "Select a level of study." };

  const fieldOfStudy = cleanText(raw.fieldOfStudy ?? raw.program, 2);
  if (!fieldOfStudy) return { ok: false, error: "Select a field of study." };

  const phoneType = cleanText(raw.phoneType, 2) || "02";
  const phoneCountryCode = digits(raw.phoneCountryCode, 4) || "33";

  const dobYear = digits(raw.dobYear, 4);
  const dobMonth = digits(raw.dobMonth, 2).padStart(2, "0");
  const dobDay = digits(raw.dobDay, 2).padStart(2, "0");
  if (dobYear.length !== 4 || Number(dobMonth) < 1 || Number(dobMonth) > 12 || Number(dobDay) < 1 || Number(dobDay) > 31) {
    return { ok: false, error: "Enter a valid date of birth." };
  }

  const required: Array<[string, string]> = [
    ["familyName", cleanText(raw.familyName)],
    ["givenName", cleanText(raw.givenName)],
    ["placeBirthCity", cleanText(raw.placeBirthCity)],
    ["placeBirthCountry", cleanText(raw.placeBirthCountry)],
    ["citizenship", cleanText(raw.citizenship)],
    ["currentCountry", cleanText(raw.currentCountry)],
    ["passportNumber", cleanText(raw.passportNumber, 40)],
    ["passportCountry", cleanText(raw.passportCountry)],
    ["nativeLang", cleanText(raw.nativeLang)],
    ["streetNum", cleanText(raw.streetNum, 20)],
    ["streetName", cleanText(raw.streetName)],
    ["city", cleanText(raw.city)],
    ["country", cleanText(raw.country)],
    ["postalCode", cleanText(raw.postalCode, 20)],
    ["phone", cleanText(raw.phone, 40)],
    ["schoolName", cleanText(raw.schoolName)],
    ["schoolCity", cleanText(raw.schoolCity)],
    ["schoolAddress", cleanText(raw.schoolAddress)],
    ["dli", cleanText(raw.dli, 40)],
    ["tuitionAmount", cleanText(raw.tuitionAmount, 20)],
    ["availableFunds", cleanText(raw.availableFunds ?? raw.tuitionAmount, 20)],
  ];

  for (const [key, value] of required) {
    if (!value) return { ok: false, error: `Missing required field: ${key}` };
  }

  const passportIssueYear = digits(raw.passportIssueYear, 4);
  const passportIssueMonth = digits(raw.passportIssueMonth, 2).padStart(2, "0");
  const passportIssueDay = digits(raw.passportIssueDay, 2).padStart(2, "0");
  if (passportIssueYear.length !== 4 || Number(passportIssueMonth) < 1 || Number(passportIssueMonth) > 12) {
    return { ok: false, error: "Enter a valid passport issue date." };
  }

  const passportExpiryYear = digits(raw.passportExpiryYear, 4);
  const passportExpiryMonth = digits(raw.passportExpiryMonth, 2).padStart(2, "0");
  const passportExpiryDay = digits(raw.passportExpiryDay, 2).padStart(2, "0");
  if (passportExpiryYear.length !== 4 || Number(passportExpiryMonth) < 1 || Number(passportExpiryMonth) > 12) {
    return { ok: false, error: "Enter a valid passport expiry date." };
  }

  const studyFromYear = digits(raw.studyFromYear, 4);
  const studyFromMonth = digits(raw.studyFromMonth, 2).padStart(2, "0");
  const studyFromDay = digits(raw.studyFromDay, 2).padStart(2, "0");
  const studyToYear = digits(raw.studyToYear, 4);
  const studyToMonth = digits(raw.studyToMonth, 2).padStart(2, "0");
  const studyToDay = digits(raw.studyToDay, 2).padStart(2, "0");
  if (studyFromYear.length !== 4 || studyToYear.length !== 4) {
    return { ok: false, error: "Enter valid study start and end dates." };
  }

  const occupationFromYear = optionalYear(raw.occupationFromYear);
  const occupationFromMonth = optionalMonth(raw.occupationFromMonth);

  const previousCor = parseYn(raw.previousCor, "N");
  const sameAsCor = parseYn(raw.sameAsCor, "Y");
  const previouslyMarried = parseYn(raw.previouslyMarried, "N");
  const educationIndicator = parseYn(raw.educationIndicator, "N");
  const sameAsMailing = parseYn(raw.sameAsMailing, "Y");
  const hasAlias = parseYn(raw.hasAlias, "N");
  const hasNatId = parseYn(raw.hasNatId, "N");
  const hasUsCard = parseYn(raw.hasUsCard, "N");

  const need = (cond: boolean, label: string, value: string) => {
    if (cond && !value) return `Missing required field: ${label}`;
    return "";
  };

  const parseCor = (prefix: string) => ({
    country: cleanText(raw[`${prefix}Country`]),
    status: cleanText(raw[`${prefix}Status`], 2),
    other: cleanText(raw[`${prefix}Other`], 80),
    fromYear: digits(raw[`${prefix}FromYear`], 4),
    fromMonth: digits(raw[`${prefix}FromMonth`], 2).padStart(2, "0"),
    fromDay: digits(raw[`${prefix}FromDay`], 2).padStart(2, "0"),
    toYear: digits(raw[`${prefix}ToYear`], 4),
    toMonth: digits(raw[`${prefix}ToMonth`], 2).padStart(2, "0"),
    toDay: digits(raw[`${prefix}ToDay`], 2).padStart(2, "0"),
  });

  const previousCorRows = [];
  if (previousCor === "Y") {
    type CorIn = {
      country?: unknown;
      status?: unknown;
      other?: unknown;
      fromYear?: unknown;
      fromMonth?: unknown;
      fromDay?: unknown;
      toYear?: unknown;
      toMonth?: unknown;
      toDay?: unknown;
    };
    const fromArray = Array.isArray(raw.previousCorRows)
      ? (raw.previousCorRows as CorIn[]).slice(0, 2)
      : [];
    const rows: CorIn[] = fromArray.length
      ? fromArray
      : [
        {
          country: raw.pcor1Country,
          status: raw.pcor1Status,
          other: raw.pcor1Other,
          fromYear: raw.pcor1FromYear,
          fromMonth: raw.pcor1FromMonth,
          fromDay: raw.pcor1FromDay,
          toYear: raw.pcor1ToYear,
          toMonth: raw.pcor1ToMonth,
          toDay: raw.pcor1ToDay,
        },
        ...(cleanText(raw.pcor2Country)
          ? [{
            country: raw.pcor2Country,
            status: raw.pcor2Status,
            other: raw.pcor2Other,
            fromYear: raw.pcor2FromYear,
            fromMonth: raw.pcor2FromMonth,
            fromDay: raw.pcor2FromDay,
            toYear: raw.pcor2ToYear,
            toMonth: raw.pcor2ToMonth,
            toDay: raw.pcor2ToDay,
          }]
          : []),
      ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const country = cleanText(row.country);
      if (!country && i > 0) continue;
      const parsed = {
        country,
        status: cleanText(row.status, 2),
        other: cleanText(row.other, 80),
        fromYear: digits(row.fromYear, 4),
        fromMonth: digits(row.fromMonth, 2).padStart(2, "0"),
        fromDay: digits(row.fromDay, 2).padStart(2, "0"),
        toYear: digits(row.toYear, 4),
        toMonth: digits(row.toMonth, 2).padStart(2, "0"),
        toDay: digits(row.toDay, 2).padStart(2, "0"),
      };
      const err = need(true, `previous country ${i + 1}`, parsed.country) ||
        need(true, `previous status ${i + 1}`, parsed.status) ||
        need(true, `previous from date ${i + 1}`, parsed.fromYear) ||
        need(true, `previous to date ${i + 1}`, parsed.toYear);
      if (err) return { ok: false, error: err };
      previousCorRows.push(parsed);
    }
    if (!previousCorRows.length) {
      return { ok: false, error: "Add at least one previous country of residence." };
    }
  }

  let cwaRow: ReturnType<typeof parseCor> | undefined;
  if (sameAsCor === "N") {
    cwaRow = parseCor("cwa");
    const err = need(true, "country where applying", cwaRow.country) ||
      need(true, "status where applying", cwaRow.status) ||
      need(true, "from date where applying", cwaRow.fromYear) ||
      need(true, "to date where applying", cwaRow.toYear);
    if (err) return { ok: false, error: err };
  }

  if (hasAlias === "Y") {
    const err = need(true, "alias family name", cleanText(raw.aliasFamilyName)) ||
      need(true, "alias given name", cleanText(raw.aliasGivenName));
    if (err) return { ok: false, error: err };
  }

  const temporaryStatus = ["03", "04", "05", "06"].includes(currentStatus);
  if (temporaryStatus) {
    const err = need(true, "current status from date", digits(raw.corFromYear, 4)) ||
      need(true, "current status to date", digits(raw.corToYear, 4));
    if (err) return { ok: false, error: err };
  }
  if (currentStatus === "06") {
    const err = need(true, "other status description", cleanText(raw.corOther, 80));
    if (err) return { ok: false, error: err };
  }

  if (maritalStatus === "01" || maritalStatus === "03") {
    const err = need(true, "spouse family name", cleanText(raw.spouseFamilyName)) ||
      need(true, "marriage date", digits(raw.marriageYear, 4));
    if (err) return { ok: false, error: err };
  }

  if (previouslyMarried === "Y") {
    const err = need(true, "previous spouse family name", cleanText(raw.prevSpouseFamilyName)) ||
      need(true, "previous relationship type", cleanText(raw.prevSpouseRelationship, 2)) ||
      need(true, "previous spouse DOB", digits(raw.prevSpouseDobYear, 4));
    if (err) return { ok: false, error: err };
  }

  if (sameAsMailing === "N") {
    const err = need(true, "residential street", cleanText(raw.resStreetName)) ||
      need(true, "residential city", cleanText(raw.resCity)) ||
      need(true, "residential country", cleanText(raw.resCountry)) ||
      need(true, "residential postal code", cleanText(raw.resPostalCode, 20));
    if (err) return { ok: false, error: err };
  }

  if (funds === "Other") {
    const err = need(true, "other person paying expenses", cleanText(raw.fundsOtherPerson));
    if (err) return { ok: false, error: err };
  }

  if (educationIndicator === "Y") {
    const row = (
      raw.educationRow && typeof raw.educationRow === "object"
        ? (raw.educationRow as Record<string, unknown>)
        : Array.isArray(raw.educationRows)
          ? (raw.educationRows[0] as Record<string, unknown> | undefined)
          : undefined
    ) ?? {};
    const err = need(true, "prior school", cleanText(row.school || raw.eduSchool)) ||
      need(true, "prior field of study", cleanText(row.fieldOfStudy || raw.eduField)) ||
      need(true, "prior school country", cleanText(row.country || raw.eduCountry));
    if (err) return { ok: false, error: err };
  }

  if (hasNatId === "Y") {
    const err = need(true, "national ID number", cleanText(raw.natIdNumber, 40)) ||
      need(true, "national ID country", cleanText(raw.natIdCountry));
    if (err) return { ok: false, error: err };
  }

  if (hasUsCard === "Y") {
    const err = need(true, "US card number", cleanText(raw.usCardNumber, 40));
    if (err) return { ok: false, error: err };
  }

  const bgTb = parseYn(raw.bgTb, "N");
  const bgDisorder = parseYn(raw.bgDisorder, "N");
  const bgOverstay = parseYn(raw.bgOverstay, "N");
  const bgRefused = parseYn(raw.bgRefused, "N");
  const bgClaimAsylum = parseYn(raw.bgClaimAsylum, "N");
  const bgCrime = parseYn(raw.bgCrime, "N");
  const bgMilitary = parseYn(raw.bgMilitary, "N");
  if ((bgTb === "Y" || bgDisorder === "Y") && !cleanText(raw.bgMedicalDetails, 500)) {
    return { ok: false, error: "Describe the medical/TB details." };
  }
  if ((bgOverstay === "Y" || bgRefused === "Y" || bgClaimAsylum === "Y") &&
    !cleanText(raw.bgRefusedDetails, 500)) {
    return { ok: false, error: "Describe the immigration history details." };
  }
  if (bgCrime === "Y" && !cleanText(raw.bgCrimeDetails, 500)) {
    return { ok: false, error: "Describe the criminal history details." };
  }
  if (bgMilitary === "Y" && !cleanText(raw.bgMilitaryDetails, 500)) {
    return { ok: false, error: "Describe the military/service details." };
  }

  type JobIn = {
    fromYear?: unknown;
    fromMonth?: unknown;
    toYear?: unknown;
    toMonth?: unknown;
    occupation?: unknown;
    employer?: unknown;
    city?: unknown;
    country?: unknown;
    provinceState?: unknown;
  };

  const jobsFromArray = Array.isArray(raw.jobs)
    ? (raw.jobs as JobIn[]).slice(0, 3)
    : [];

  const flatJobs: JobIn[] = jobsFromArray.length
    ? jobsFromArray
    : [
      ...(cleanText(raw.occupation)
        ? [{
          fromYear: occupationFromYear,
          fromMonth: occupationFromMonth,
          toYear: raw.occupationToYear,
          toMonth: raw.occupationToMonth,
          occupation: raw.occupation,
          employer: raw.employer,
          city: raw.occupationCity || raw.city,
          country: raw.occupationCountry || raw.currentCountry,
          provinceState: raw.occupationProvince,
        }]
        : []),
      ...(cleanText(raw.job2Occupation)
        ? [{
          fromYear: raw.job2FromYear,
          fromMonth: raw.job2FromMonth,
          toYear: raw.job2ToYear,
          toMonth: raw.job2ToMonth,
          occupation: raw.job2Occupation,
          employer: raw.job2Employer,
          city: raw.job2City,
          country: raw.job2Country,
          provinceState: raw.job2Province,
        }]
        : []),
      ...(cleanText(raw.job3Occupation)
        ? [{
          fromYear: raw.job3FromYear,
          fromMonth: raw.job3FromMonth,
          toYear: raw.job3ToYear,
          toMonth: raw.job3ToMonth,
          occupation: raw.job3Occupation,
          employer: raw.job3Employer,
          city: raw.job3City,
          country: raw.job3Country,
          provinceState: raw.job3Province,
        }]
        : []),
    ];

  const jobs = [];
  for (let i = 0; i < flatJobs.length; i++) {
    const row = flatJobs[i];
    const occupation = cleanText(row.occupation);
    if (!occupation && i > 0) continue;
    if (!occupation) {
      continue;
    }
    const fromYear = optionalYear(row.fromYear) || (i === 0 ? occupationFromYear : undefined);
    const fromMonth = optionalMonth(row.fromMonth) ||
      (i === 0 ? occupationFromMonth : undefined) ||
      "01";
    if (!fromYear) {
      return { ok: false, error: `Job ${i + 1}: enter a start year.` };
    }
    const to = optionalYearMonth(row.toYear, row.toMonth);
    if (to.error) return { ok: false, error: `Job ${i + 1}: ${to.error}` };
    jobs.push({
      fromYear,
      fromMonth,
      toYear: to.year,
      toMonth: to.month,
      occupation,
      employer: cleanText(row.employer) || "Employer",
      city: cleanText(row.city) || required[11][1],
      country: cleanText(row.country) || required[5][1],
      provinceState: cleanText(row.provinceState, 40) || undefined,
    });
  }
  if (!jobs.length) {
    return { ok: false, error: "Add at least one employment / activity row." };
  }

  if (schoolProvince === "QC") {
    const caq = cleanText(raw.caqNumber, 40);
    if (!caq) {
      return { ok: false, error: "Enter your CAQ number (required for studies in Quebec)." };
    }
    if (!digits(raw.caqExpiryYear, 4)) {
      return { ok: false, error: "Enter your CAQ expiry date (required for studies in Quebec)." };
    }
  }

  const answers: Imm1294Answers = {
    email,
    familyName: required[0][1],
    givenName: required[1][1],
    sex: sex as Imm1294Answers["sex"],
    dobYear,
    dobMonth,
    dobDay,
    placeBirthCity: required[2][1],
    placeBirthCountry: required[3][1],
    citizenship: required[4][1],
    maritalStatus,
    spouseFamilyName: cleanText(raw.spouseFamilyName) || undefined,
    spouseGivenName: cleanText(raw.spouseGivenName) || undefined,
    marriageYear: optionalYear(raw.marriageYear),
    marriageMonth: optionalMonth(raw.marriageMonth),
    marriageDay: optionalDay(raw.marriageDay),
    currentCountry: required[5][1],
    currentStatus,
    corFromYear: optionalYear(raw.corFromYear),
    corFromMonth: optionalMonth(raw.corFromMonth),
    corFromDay: optionalDay(raw.corFromDay),
    corToYear: optionalYear(raw.corToYear),
    corToMonth: optionalMonth(raw.corToMonth),
    corToDay: optionalDay(raw.corToDay),
    corOther: cleanText(raw.corOther, 80) || undefined,
    previousCor,
    previousCorRows,
    sameAsCor,
    cwaRow,
    previouslyMarried,
    prevSpouse: previouslyMarried === "Y"
      ? {
        familyName: cleanText(raw.prevSpouseFamilyName),
        givenName: cleanText(raw.prevSpouseGivenName),
        dobYear: digits(raw.prevSpouseDobYear, 4),
        dobMonth: digits(raw.prevSpouseDobMonth, 2).padStart(2, "0"),
        dobDay: digits(raw.prevSpouseDobDay, 2).padStart(2, "0"),
        relationshipType: cleanText(raw.prevSpouseRelationship, 2),
        fromYear: digits(raw.prevSpouseFromYear, 4),
        fromMonth: digits(raw.prevSpouseFromMonth, 2).padStart(2, "0"),
        fromDay: digits(raw.prevSpouseFromDay, 2).padStart(2, "0"),
        toYear: digits(raw.prevSpouseToYear, 4),
        toMonth: digits(raw.prevSpouseToMonth, 2).padStart(2, "0"),
        toDay: digits(raw.prevSpouseToDay, 2).padStart(2, "0"),
      }
      : undefined,
    hasAlias,
    aliasFamilyName: cleanText(raw.aliasFamilyName) || undefined,
    aliasGivenName: cleanText(raw.aliasGivenName) || undefined,
    hasNatId,
    natIdNumber: cleanText(raw.natIdNumber, 40) || undefined,
    natIdCountry: cleanText(raw.natIdCountry) || undefined,
    natIdIssueYear: digits(raw.natIdIssueYear, 4) || undefined,
    natIdIssueMonth: optionalMonth(raw.natIdIssueMonth),
    natIdIssueDay: optionalDay(raw.natIdIssueDay),
    natIdExpiryYear: optionalYear(raw.natIdExpiryYear),
    natIdExpiryMonth: optionalMonth(raw.natIdExpiryMonth),
    natIdExpiryDay: optionalDay(raw.natIdExpiryDay),
    hasUsCard,
    usCardNumber: cleanText(raw.usCardNumber, 40) || undefined,
    usCardExpiryYear: optionalYear(raw.usCardExpiryYear),
    usCardExpiryMonth: optionalMonth(raw.usCardExpiryMonth),
    usCardExpiryDay: optionalDay(raw.usCardExpiryDay),
    passportNumber: required[6][1],
    passportCountry: required[7][1],
    passportIssueYear,
    passportIssueMonth,
    passportIssueDay,
    passportExpiryYear,
    passportExpiryMonth,
    passportExpiryDay,
    nativeLang: required[8][1],
    ableToCommunicate: ableToCommunicate as Imm1294Answers["ableToCommunicate"],
    preferredLang: cleanText(raw.preferredLang, 20) === "French" ? "French" : "English",
    langTest: parseYn(raw.langTest, "N"),
    streetNum: required[9][1],
    streetName: required[10][1],
    city: required[11][1],
    country: required[12][1],
    provinceState: cleanText(raw.provinceState, 40),
    postalCode: required[13][1],
    sameAsMailing,
    aptUnit: cleanText(raw.aptUnit, 20) || undefined,
    residential: sameAsMailing === "N"
      ? {
        streetNum: cleanText(raw.resStreetNum, 20) || "1",
        streetName: cleanText(raw.resStreetName),
        city: cleanText(raw.resCity),
        country: cleanText(raw.resCountry),
        provinceState: cleanText(raw.resProvinceState, 40) || undefined,
        postalCode: cleanText(raw.resPostalCode, 20),
        aptUnit: cleanText(raw.resAptUnit, 20) || undefined,
      }
      : undefined,
    phone: required[14][1],
    phoneType,
    phoneCountryCode,
    schoolName: required[15][1],
    studyLevel,
    fieldOfStudy,
    schoolProvince,
    schoolCity: required[16][1],
    schoolAddress: required[17][1],
    dli: required[18][1],
    studyFromYear,
    studyFromMonth,
    studyFromDay,
    studyToYear,
    studyToMonth,
    studyToDay,
    tuitionAmount: required[19][1],
    roomBoard: cleanText(raw.roomBoard, 20) || undefined,
    otherStudyCosts: cleanText(raw.otherStudyCosts, 20) || undefined,
    availableFunds: required[20][1],
    funds: funds as Imm1294Answers["funds"],
    fundsOtherPerson: cleanText(raw.fundsOtherPerson) || undefined,
    caqNumber: cleanText(raw.caqNumber, 40) || undefined,
    caqExpiryYear: digits(raw.caqExpiryYear, 4) || undefined,
    caqExpiryMonth: optionalMonth(raw.caqExpiryMonth),
    caqExpiryDay: optionalDay(raw.caqExpiryDay),
    palNumber: cleanText(raw.palNumber, 40) || undefined,
    palExpiryYear: optionalYear(raw.palExpiryYear),
    palExpiryMonth: optionalMonth(raw.palExpiryMonth),
    palExpiryDay: optionalDay(raw.palExpiryDay),
    educationIndicator,
    educationRow: educationIndicator === "Y"
      ? (() => {
        const row = (
          raw.educationRow && typeof raw.educationRow === "object"
            ? (raw.educationRow as Record<string, unknown>)
            : Array.isArray(raw.educationRows)
              ? (raw.educationRows[0] as Record<string, unknown> | undefined)
              : undefined
        ) ?? {};
        const from = String(row.from || "");
        const to = String(row.to || "");
        const fromIso = /^(\d{4})-(\d{2})/.exec(from);
        const toIso = /^(\d{4})-(\d{2})/.exec(to);
        return {
          fromYear: digits(row.fromYear ?? fromIso?.[1] ?? raw.eduFromYear, 4),
          fromMonth: (optionalMonth(row.fromMonth ?? fromIso?.[2] ?? raw.eduFromMonth) || "09"),
          toYear: digits(row.toYear ?? toIso?.[1] ?? raw.eduToYear, 4),
          toMonth: (optionalMonth(row.toMonth ?? toIso?.[2] ?? raw.eduToMonth) || "06"),
          fieldOfStudy: cleanText(row.fieldOfStudy || raw.eduField),
          school: cleanText(row.school || raw.eduSchool),
          city: cleanText(row.city || raw.eduCity) || required[11][1],
          country: cleanText(row.country || raw.eduCountry),
          provinceState: cleanText(row.provinceState || raw.eduProvince, 40) || undefined,
        };
      })()
      : undefined,
    jobs,
    bgTb,
    bgDisorder,
    bgMedicalDetails: cleanText(raw.bgMedicalDetails, 500) || undefined,
    bgOverstay,
    bgRefused,
    bgClaimAsylum,
    bgRefusedDetails: cleanText(raw.bgRefusedDetails, 500) || undefined,
    bgCrime,
    bgCrimeDetails: cleanText(raw.bgCrimeDetails, 500) || undefined,
    bgMilitary,
    bgMilitaryDetails: cleanText(raw.bgMilitaryDetails, 500) || undefined,
    bgViolence: parseYn(raw.bgViolence, "N"),
    bgWitness: parseYn(raw.bgWitness, "N"),
    cicContactConsent: parseYn(raw.cicContactConsent, "N"),
    serviceIn: cleanText(raw.serviceIn, 20) === "French" ? "French" : "English",
  };

  return { ok: true, answers };
}
