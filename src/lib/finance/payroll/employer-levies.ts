import { round2 } from "../taxes";
import { remaining } from "./cpp-qpp";
import type { EmployerLevies, HsfSector, PayrollYearRates, PayrollYtd } from "./types";

export function hsfContributionRate(
  totalPayroll: number,
  sector: HsfSector,
  rates: PayrollYearRates["hsf"]
): number {
  if (sector === "public") return rates.publicRate;
  const band = sector === "primary_manufacturing" ? rates.primaryManufacturing : rates.other;
  if (totalPayroll <= rates.smallPayrollCeiling) return band.smallRate;
  if (totalPayroll >= rates.largePayrollFloor) return rates.maxRate;
  const percent = band.formulaIntercept + band.formulaSlope * (totalPayroll / 1_000_000);
  return round2(percent) / 100;
}

export function calculateEmployerLevies(params: {
  quebec: boolean;
  grossPay: number;
  ytd: Pick<PayrollYtd, "cntAssessable" | "cnesstAssessable">;
  totalPayroll: number;
  hsfSector: HsfSector;
  hsfRateOverride: number | null;
  cnesstRate: number;
  rates: PayrollYearRates;
}): EmployerLevies {
  if (!params.quebec) {
    return { hsfRate: 0, hsf: 0, cnt: 0, cnesst: 0, wsdrf: 0 };
  }
  const hsfRate =
    params.hsfRateOverride != null && params.hsfRateOverride >= 0
      ? params.hsfRateOverride
      : hsfContributionRate(params.totalPayroll, params.hsfSector, params.rates.hsf);
  const cntAssessable = Math.min(params.grossPay, remaining(params.ytd.cntAssessable, params.rates.cnt.maxAssessable));
  const cnesstAssessable = Math.min(
    params.grossPay,
    remaining(params.ytd.cnesstAssessable, params.rates.cnesst.maxAssessable)
  );
  const wsdrf =
    params.totalPayroll > params.rates.wsdrf.payrollThreshold
      ? round2(params.grossPay * params.rates.wsdrf.rate)
      : 0;
  return {
    hsfRate,
    hsf: round2(params.grossPay * hsfRate),
    cnt: round2(cntAssessable * params.rates.cnt.rate),
    cnesst: round2(cnesstAssessable * params.cnesstRate),
    wsdrf,
  };
}
