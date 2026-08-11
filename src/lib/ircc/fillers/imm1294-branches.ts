/** Conditional IMM 1294 answer shapes (Valider branches). */

export type YesNo = "Y" | "N";

export type CorRow = {
  country: string;
  status: string;
  other?: string;
  fromYear: string;
  fromMonth: string;
  fromDay: string;
  toYear: string;
  toMonth: string;
  toDay: string;
};

export type PrevSpouse = {
  familyName: string;
  givenName: string;
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  /** MaritalStatusHistory lic: 01 married, 03 common-law */
  relationshipType: string;
  fromYear: string;
  fromMonth: string;
  fromDay: string;
  toYear: string;
  toMonth: string;
  toDay: string;
};

export type EducationRow = {
  fromYear: string;
  fromMonth: string;
  toYear: string;
  toMonth: string;
  fieldOfStudy: string;
  school: string;
  city: string;
  country: string;
  provinceState?: string;
};

export type JobRow = {
  fromYear: string;
  fromMonth: string;
  toYear?: string;
  toMonth?: string;
  occupation: string;
  employer: string;
  city: string;
  country: string;
  provinceState?: string;
};

export type ResidentialAddress = {
  streetNum: string;
  streetName: string;
  city: string;
  country: string;
  provinceState?: string;
  postalCode: string;
  aptUnit?: string;
};

export function isoDate(y: string, m: string, d: string): string {
  return [y, m, d].filter(Boolean).join("-");
}

export function yn(value: unknown, fallback: YesNo = "N"): YesNo {
  const v = String(value ?? fallback).trim().toUpperCase();
  return v === "Y" || v === "YES" ? "Y" : "N";
}
