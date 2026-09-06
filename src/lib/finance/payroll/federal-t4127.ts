import { round2 } from "../taxes";
import type { PayrollYearRates, TaxBracket } from "./types";

export function bracketTax(income: number, brackets: TaxBracket[]): number {
  if (income <= 0) return 0;
  let selected = brackets[0];
  for (const row of brackets) {
    if (income >= row.from) selected = row;
  }
  return Math.max(0, income * selected.rate - selected.k);
}

export function federalBasicPersonalAmount(netIncome: number, federal: PayrollYearRates["federal"]): number {
  if (netIncome <= federal.bpaPhaseStart) return federal.bpaMax;
  if (netIncome >= federal.bpaPhaseEnd) return federal.bpaMin;
  const additional = federal.bpaMax - federal.bpaMin;
  const span = federal.bpaPhaseEnd - federal.bpaPhaseStart;
  return federal.bpaMax - ((netIncome - federal.bpaPhaseStart) / span) * additional;
}

/**
 * T4127 Option 1 federal tax for the pay period (Quebec uses K2Q + 16.5% abatement).
 * Intermediate period amounts are rounded to the cent before annualizing, matching T4032-QC.
 */
export function calculateFederalTax(params: {
  periods: number;
  periodicGross: number;
  bonus: number;
  rrspThisPeriod: number;
  unionDuesThisPeriod: number;
  additionalTaxRequested: number;
  quebec: boolean;
  qppOrCppBaseThisPeriod: number;
  qppOrCppAdditionalThisPeriod: number;
  eiThisPeriod: number;
  qpipThisPeriod: number;
  td1FederalClaim: number | null;
  projectedAnnualIncome: number | null;
  pensionIncomeOnly: boolean;
  rates: PayrollYearRates;
}): { federalTax: number; annualTaxableIncome: number; annualFederalTax: number } {
  const { rates, periods } = params;
  const f = rates.federal;

  const taxOn = (annualizablePeriodic: number, extraBonus: number) => {
    const f5a = params.qppOrCppAdditionalThisPeriod;
    const periodicNet = Math.max(0, annualizablePeriodic - params.rrspThisPeriod - params.unionDuesThisPeriod - f5a);
    const annualized = params.projectedAnnualIncome != null && extraBonus === 0
      ? Math.max(0, params.projectedAnnualIncome - periods * (params.rrspThisPeriod + f5a))
      : round2(periodicNet * periods);
    const A = round2(annualized + extraBonus);
    if (A <= 0) return { A, T1: 0 };

    const grossFederal = round2(bracketTax(A, f.brackets));
    const tc = params.td1FederalClaim != null ? params.td1FederalClaim : federalBasicPersonalAmount(A, f);
    const cea = params.pensionIncomeOnly ? 0 : Math.min(f.canadaEmploymentAmount, Math.max(0, A));
    const qppBaseAnnual = Math.min(round2(params.qppOrCppBaseThisPeriod * periods), quebecPlanMax(params));
    const eiAnnual = Math.min(
      round2(params.eiThisPeriod * periods),
      params.quebec ? rates.ei.maxEmployeeQuebec : rates.ei.maxEmployee
    );
    const qpipAnnual = params.quebec ? Math.min(round2(params.qpipThisPeriod * periods), rates.qpip.maxEmployee) : 0;
    const creditBase = tc + qppBaseAnnual + eiAnnual + qpipAnnual + cea;
    const credits = round2(creditBase * f.lowestRate);
    const t3 = Math.max(0, round2(grossFederal - credits));
    const T1 = params.quebec ? Math.max(0, round2(t3 * (1 - f.quebecAbatement))) : t3;
    return { A, T1 };
  };

  const regular = taxOn(params.periodicGross, 0);
  const withBonus =
    params.bonus > 0 ? taxOn(params.periodicGross, params.bonus) : regular;
  const annualFederalTax = round2(regular.T1 + (withBonus.T1 - regular.T1));
  const federalTax = round2(annualFederalTax / periods + params.additionalTaxRequested);
  return {
    federalTax: Math.max(0, federalTax),
    annualTaxableIncome: withBonus.A,
    annualFederalTax,
  };
}

function quebecPlanMax(params: { quebec: boolean; rates: PayrollYearRates }): number {
  return params.quebec ? params.rates.qpp.maxBaseOnly : params.rates.cpp.maxEmployeeToYmpe * (0.0495 / 0.0595);
}
