import { round2 } from "../taxes";
import { bracketTax } from "./federal-t4127";
import type { CaProvinceCode, PayrollYearRates } from "./types";

export function calculateQuebecTax(params: {
  periods: number;
  periodicGross: number;
  bonus: number;
  rrspThisPeriod: number;
  qppEmployeeThisPeriod: number;
  qpipEmployeeThisPeriod: number;
  additionalQuebecTaxRequested: number;
  td1ProvincialClaim: number | null;
  projectedAnnualIncome: number | null;
  rates: PayrollYearRates;
}): { provincialTax: number; annualQuebecTax: number } {
  const qc = params.rates.quebec;
  const taxOn = (periodic: number, extraBonus: number) => {
    const G =
      params.projectedAnnualIncome != null && extraBonus === 0
        ? params.projectedAnnualIncome
        : round2(periodic * params.periods + extraBonus);
    const worker = Math.min(qc.workerDeductionMax, round2(qc.workerDeductionRate * G));
    const qppAnnual = Math.min(round2(params.qppEmployeeThisPeriod * params.periods), params.rates.qpp.maxEmployeeToYmpe);
    const rrspAnnual = round2(params.rrspThisPeriod * params.periods);
    const I1 = Math.max(0, round2(G - worker - qppAnnual - rrspAnnual));
    const grossTax = round2(bracketTax(I1, qc.brackets));
    const bpa = params.td1ProvincialClaim != null ? params.td1ProvincialClaim : qc.bpa;
    const qpipAnnual = Math.min(round2(params.qpipEmployeeThisPeriod * params.periods), params.rates.qpip.maxEmployee);
    const credits = round2((bpa + qpipAnnual) * qc.lowestRate);
    return Math.max(0, round2(grossTax - credits));
  };

  const regular = taxOn(params.periodicGross, 0);
  const withBonus = params.bonus > 0 ? taxOn(params.periodicGross, params.bonus) : regular;
  const annualQuebecTax = round2(regular + (withBonus - regular));
  return {
    annualQuebecTax,
    provincialTax: Math.max(0, round2(annualQuebecTax / params.periods + params.additionalQuebecTaxRequested)),
  };
}

export function calculateOtherProvincialTax(params: {
  province: Exclude<CaProvinceCode, "QC">;
  periods: number;
  annualTaxableIncome: number;
  cppBaseThisPeriod: number;
  eiThisPeriod: number;
  td1ProvincialClaim: number | null;
  additionalTaxRequested: number;
  rates: PayrollYearRates;
}): { provincialTax: number } {
  const table = params.rates.provincial[params.province];
  const A = params.annualTaxableIncome;
  if (A <= 0) return { provincialTax: Math.max(0, params.additionalTaxRequested) };
  const gross = round2(bracketTax(A, table.brackets));
  const tcp = params.td1ProvincialClaim != null ? params.td1ProvincialClaim : table.bpa;
  const k1p = round2(table.lowestRate * tcp);
  const cppAnnual = Math.min(
    round2(params.cppBaseThisPeriod * params.periods),
    params.rates.cpp.maxEmployeeToYmpe * (params.rates.cpp.baseRate / params.rates.cpp.combinedRate)
  );
  const eiAnnual = Math.min(round2(params.eiThisPeriod * params.periods), params.rates.ei.maxEmployee);
  const k2p = round2(table.lowestRate * (cppAnnual + eiAnnual));
  const t2 = Math.max(0, round2(gross - k1p - k2p));
  return { provincialTax: Math.max(0, round2(t2 / params.periods + params.additionalTaxRequested)) };
}
