import type { PayFrequency } from "../types";
import rates2026 from "./rates/2026.json";
import type { PayrollYearRates } from "./types";

const YEAR_TABLES: Record<number, PayrollYearRates> = {
  2026: rates2026 as PayrollYearRates,
};

export const PAYROLL_RATES_YEAR = 2026;

export function payrollYearFromDate(isoDate: string | Date): number {
  if (typeof isoDate === "string") return Number(isoDate.slice(0, 4));
  return isoDate.getUTCFullYear();
}

export function loadPayrollRates(year: number = PAYROLL_RATES_YEAR): PayrollYearRates {
  const table = YEAR_TABLES[year] ?? YEAR_TABLES[PAYROLL_RATES_YEAR];
  if (!table) {
    throw new Error(`No payroll rate table for ${year}`);
  }
  return table;
}

export function periodsPerYear(freq: PayFrequency, rates: PayrollYearRates = loadPayrollRates()): number {
  return rates.payPeriods[freq];
}
