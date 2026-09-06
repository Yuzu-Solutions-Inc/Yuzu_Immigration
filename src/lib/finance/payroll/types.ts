import type { PayFrequency } from "../types";

export type CaProvinceCode =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NT"
  | "NS"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export type HsfSector = "other" | "primary_manufacturing" | "public";

export interface TaxBracket {
  from: number;
  rate: number;
  k: number;
}

export interface PensionPlanRates {
  ympe: number;
  yampe: number;
  basicExemption: number;
  baseRate: number;
  firstAdditionalRate: number;
  combinedRate: number;
  secondRate: number;
  maxEmployeeToYmpe: number;
  maxEmployeeSecond: number;
  maxEmployeeTotal: number;
  maxBaseOnly?: number;
}

export interface ProvincialTaxTable {
  bpa: number;
  lowestRate: number;
  brackets: TaxBracket[];
}

export interface PayrollYearRates {
  year: number;
  effectiveFrom: string;
  effectiveTo: string;
  payPeriods: Record<PayFrequency, number>;
  federal: {
    lowestRate: number;
    bpaMax: number;
    bpaMin: number;
    bpaPhaseStart: number;
    bpaPhaseEnd: number;
    canadaEmploymentAmount: number;
    quebecAbatement: number;
    outsideCanadaSurtax: number;
    brackets: TaxBracket[];
  };
  cpp: PensionPlanRates;
  qpp: PensionPlanRates & { maxBaseOnly: number };
  ei: {
    maxInsurable: number;
    employeeRate: number;
    employeeRateQuebec: number;
    employerMultiplier: number;
    maxEmployee: number;
    maxEmployeeQuebec: number;
    maxEmployer: number;
    maxEmployerQuebec: number;
  };
  qpip: {
    maxInsurable: number;
    employeeRate: number;
    employerRate: number;
    maxEmployee: number;
    maxEmployer: number;
  };
  quebec: {
    bpa: number;
    lowestRate: number;
    workerDeductionRate: number;
    workerDeductionMax: number;
    brackets: TaxBracket[];
  };
  hsf: {
    smallPayrollCeiling: number;
    largePayrollFloor: number;
    maxRate: number;
    other: { smallRate: number; formulaIntercept: number; formulaSlope: number };
    primaryManufacturing: { smallRate: number; formulaIntercept: number; formulaSlope: number };
    publicRate: number;
  };
  cnt: { rate: number; maxAssessable: number };
  cnesst: { maxAssessable: number };
  wsdrf: { payrollThreshold: number; rate: number };
  provincial: Record<Exclude<CaProvinceCode, "QC">, ProvincialTaxTable>;
}

/** Year-to-date amounts before the current pay period, with this employer. */
export interface PayrollYtd {
  pensionableEarnings: number;
  insurableEarnings: number;
  qpipInsurableEarnings: number;
  cppEmployee: number;
  cpp2Employee: number;
  qppEmployee: number;
  qpp2Employee: number;
  eiEmployee: number;
  qpipEmployee: number;
  cntAssessable: number;
  cnesstAssessable: number;
  federalTax: number;
  provincialTax: number;
  grossPay: number;
}

export const EMPTY_PAYROLL_YTD: PayrollYtd = {
  pensionableEarnings: 0,
  insurableEarnings: 0,
  qpipInsurableEarnings: 0,
  cppEmployee: 0,
  cpp2Employee: 0,
  qppEmployee: 0,
  qpp2Employee: 0,
  eiEmployee: 0,
  qpipEmployee: 0,
  cntAssessable: 0,
  cnesstAssessable: 0,
  federalTax: 0,
  provincialTax: 0,
  grossPay: 0,
};

export interface PayPeriodInput {
  paymentDate: string;
  payFrequency: PayFrequency;
  /** Periodic gross (salary, taxable benefits paid this period). Factor I. */
  grossPay: number;
  /** Non-periodic bonus / taxable reimbursement this period only. Factor B. */
  bonus: number;
  rrspThisPeriod: number;
  unionDuesThisPeriod: number;
  additionalTaxRequested: number;
  additionalQuebecTaxRequested: number;
  provinceOfEmployment: CaProvinceCode;
  td1FederalClaim: number | null;
  td1ProvincialClaim: number | null;
  projectedAnnualIncome: number | null;
  pensionableMonths: number;
  cppQppExempt: boolean;
  eiExempt: boolean;
  qpipExempt: boolean;
  ytd: PayrollYtd;
  employer: {
    totalPayroll: number;
    hsfSector: HsfSector;
    hsfRateOverride: number | null;
    cnesstRate: number;
  };
}

export interface PensionContribution {
  employee: number;
  employer: number;
  employeeSecond: number;
  employerSecond: number;
  employeeCombined: number;
  employerCombined: number;
  baseForCredit: number;
  additionalDeductible: number;
  pensionableThisPeriod: number;
}

export interface PremiumContribution {
  employee: number;
  employer: number;
  insurableThisPeriod: number;
}

export interface EmployerLevies {
  hsfRate: number;
  hsf: number;
  cnt: number;
  cnesst: number;
  wsdrf: number;
}

export interface PayPeriodResult {
  year: number;
  provinceOfEmployment: CaProvinceCode;
  periods: number;
  grossPay: number;
  bonus: number;
  pensionable: number;
  insurable: number;
  cpp: PensionContribution;
  qpp: PensionContribution;
  ei: PremiumContribution;
  qpip: PremiumContribution;
  federalTax: number;
  provincialTax: number;
  levies: EmployerLevies;
  otherDeductions: number;
  employeeStatutory: number;
  employerStatutory: number;
  netPay: number;
  annualTaxableIncome: number;
  t4: Record<string, number>;
  rl1: Record<string, number>;
}
