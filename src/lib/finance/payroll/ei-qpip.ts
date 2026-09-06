import { round2 } from "../taxes";
import { remaining } from "./cpp-qpp";
import type { PayrollYearRates, PayrollYtd, PremiumContribution } from "./types";

export function calculateEiPremium(params: {
  insurableThisPeriod: number;
  quebec: boolean;
  exempt: boolean;
  ytd: Pick<PayrollYtd, "eiEmployee" | "insurableEarnings">;
  rates: PayrollYearRates["ei"];
}): PremiumContribution {
  const zero: PremiumContribution = { employee: 0, employer: 0, insurableThisPeriod: 0 };
  if (params.exempt || params.insurableThisPeriod <= 0) return zero;

  const employeeRate = params.quebec ? params.rates.employeeRateQuebec : params.rates.employeeRate;
  const maxEmployee = params.quebec ? params.rates.maxEmployeeQuebec : params.rates.maxEmployee;
  const roomInsurable = remaining(params.ytd.insurableEarnings, params.rates.maxInsurable);
  const insurable = Math.min(params.insurableThisPeriod, roomInsurable);
  const employee = Math.min(round2(insurable * employeeRate), remaining(params.ytd.eiEmployee, maxEmployee));
  return {
    employee,
    employer: round2(employee * params.rates.employerMultiplier),
    insurableThisPeriod: insurable,
  };
}

export function calculateQpipPremium(params: {
  insurableThisPeriod: number;
  quebec: boolean;
  exempt: boolean;
  ytd: Pick<PayrollYtd, "qpipEmployee" | "qpipInsurableEarnings">;
  rates: PayrollYearRates["qpip"];
}): PremiumContribution {
  const zero: PremiumContribution = { employee: 0, employer: 0, insurableThisPeriod: 0 };
  if (!params.quebec || params.exempt || params.insurableThisPeriod <= 0) return zero;

  const roomInsurable = remaining(params.ytd.qpipInsurableEarnings, params.rates.maxInsurable);
  const insurable = Math.min(params.insurableThisPeriod, roomInsurable);
  const employee = Math.min(
    round2(insurable * params.rates.employeeRate),
    remaining(params.ytd.qpipEmployee, params.rates.maxEmployee)
  );
  const employer = round2(employee * (params.rates.employerRate / params.rates.employeeRate));
  return {
    employee,
    employer,
    insurableThisPeriod: insurable,
  };
}
