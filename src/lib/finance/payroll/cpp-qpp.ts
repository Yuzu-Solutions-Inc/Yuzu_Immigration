import { round2 } from "../taxes";
import type { PensionContribution, PensionPlanRates, PayrollYtd } from "./types";

export function remaining(used: number, cap: number) {
  return Math.max(0, round2(cap - Math.max(0, used)));
}

/**
 * CRA T4127 Ch. 6 / Retraite Québec QPP: period exemption is YMPE basic / P,
 * then the contribution is rounded to the cent and capped by remaining annual room.
 * CPP2 / QPP2 uses year-to-date pensionable earnings vs YMPE (Factor W).
 */
export function calculatePensionContribution(params: {
  pensionableThisPeriod: number;
  periods: number;
  pensionableMonths: number;
  ytd: Pick<PayrollYtd, "pensionableEarnings" | "cppEmployee" | "cpp2Employee" | "qppEmployee" | "qpp2Employee">;
  plan: PensionPlanRates;
  kind: "cpp" | "qpp";
  exempt: boolean;
}): PensionContribution {
  const zero: PensionContribution = {
    employee: 0,
    employer: 0,
    employeeSecond: 0,
    employerSecond: 0,
    employeeCombined: 0,
    employerCombined: 0,
    baseForCredit: 0,
    additionalDeductible: 0,
    pensionableThisPeriod: 0,
  };
  if (params.exempt || params.pensionableThisPeriod <= 0) return zero;

  const pm = Math.min(12, Math.max(1, params.pensionableMonths));
  const ympeProrated = params.plan.ympe * (pm / 12);
  const maxCombined = params.plan.maxEmployeeToYmpe * (pm / 12);
  const maxSecond = params.plan.maxEmployeeSecond * (pm / 12);
  const ytdCombined = params.kind === "qpp" ? params.ytd.qppEmployee : params.ytd.cppEmployee;
  const ytdSecond = params.kind === "qpp" ? params.ytd.qpp2Employee : params.ytd.cpp2Employee;
  const ytdPi = params.ytd.pensionableEarnings;
  const pi = params.pensionableThisPeriod;
  const exemption = params.plan.basicExemption / params.periods;

  const contributory = Math.max(0, pi - exemption);
  const uncappedCombined = round2(contributory * params.plan.combinedRate);
  const employee = Math.min(uncappedCombined, remaining(ytdCombined, maxCombined));

  const w = Math.max(ytdPi, ympeProrated);
  const secondBase = Math.max(0, ytdPi + pi - w);
  const uncappedSecond = round2(secondBase * params.plan.secondRate);
  const employeeSecond = Math.min(uncappedSecond, remaining(ytdSecond, maxSecond));

  const baseForCredit = round2(employee * (params.plan.baseRate / params.plan.combinedRate));
  const additionalDeductible = round2(employee - baseForCredit + employeeSecond);

  return {
    employee,
    employer: employee,
    employeeSecond,
    employerSecond: employeeSecond,
    employeeCombined: round2(employee + employeeSecond),
    employerCombined: round2(employee + employeeSecond),
    baseForCredit,
    additionalDeductible,
    pensionableThisPeriod: pi,
  };
}
