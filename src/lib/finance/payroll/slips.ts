import { round2 } from "../taxes";
import type { PayPeriodResult } from "./types";

/** T4 box mapping for a single pay period (sum across the year when issuing slips). */
export function t4Boxes(result: PayPeriodResult): Record<string, number> {
  const pension = result.provinceOfEmployment === "QC" ? result.qpp : result.cpp;
  return {
    box14_employmentIncome: result.grossPay,
    box16_cpp: result.provinceOfEmployment === "QC" ? 0 : pension.employee,
    box16a_cpp2: result.provinceOfEmployment === "QC" ? 0 : pension.employeeSecond,
    box17_qpp: result.provinceOfEmployment === "QC" ? pension.employee : 0,
    box17a_qpp2: result.provinceOfEmployment === "QC" ? pension.employeeSecond : 0,
    box18_ei: result.ei.employee,
    box22_incomeTax: round2(result.federalTax + (result.provinceOfEmployment === "QC" ? 0 : result.provincialTax)),
    box24_eiInsurable: result.ei.insurableThisPeriod,
    box26_cppQppPensionable: pension.pensionableThisPeriod,
    other_qpip: result.qpip.employee,
  };
}

/** Relevé 1 box mapping (Quebec). Federal tax is reported on the T4, not RL-1. */
export function rl1Boxes(result: PayPeriodResult): Record<string, number> {
  if (result.provinceOfEmployment !== "QC") return {};
  return {
    boxA_employmentIncome: result.grossPay,
    boxB_qpp: result.qpp.employee,
    boxB_qpp2: result.qpp.employeeSecond,
    boxC_ei: result.ei.employee,
    boxE_incomeTax: result.provincialTax,
    boxH_qpip: result.qpip.employee,
    boxI_qpipInsurable: result.qpip.insurableThisPeriod,
    boxG_qppPensionable: result.qpp.pensionableThisPeriod,
  };
}
