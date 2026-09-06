import { round2 } from "../taxes";
import { calculatePensionContribution } from "./cpp-qpp";
import { calculateEiPremium, calculateQpipPremium } from "./ei-qpip";
import { calculateEmployerLevies } from "./employer-levies";
import { calculateFederalTax } from "./federal-t4127";
import { calculateOtherProvincialTax, calculateQuebecTax } from "./quebec-tp1015";
import { loadPayrollRates, payrollYearFromDate, periodsPerYear } from "./rates";
import { rl1Boxes, t4Boxes } from "./slips";
import {
  EMPTY_PAYROLL_YTD,
  type CaProvinceCode,
  type PayPeriodInput,
  type PayPeriodResult,
  type PensionContribution,
} from "./types";

const ZERO_PENSION: PensionContribution = {
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

export function isQuebecEmployment(province: CaProvinceCode): boolean {
  return province === "QC";
}

function otherEmploymentProvince(
  province: CaProvinceCode,
): Exclude<CaProvinceCode, "QC"> {
  if (province === "QC") return "ON";
  return province;
}

export function calculatePayPeriod(input: PayPeriodInput): PayPeriodResult {
  const year = payrollYearFromDate(input.paymentDate);
  const rates = loadPayrollRates(year);
  const periods = periodsPerYear(input.payFrequency, rates);
  const quebec = isQuebecEmployment(input.provinceOfEmployment);
  const ytd = input.ytd ?? EMPTY_PAYROLL_YTD;
  const periodicGross = round2(Math.max(0, input.grossPay));
  const bonus = round2(Math.max(0, input.bonus));
  const totalPay = round2(periodicGross + bonus);
  const pensionable = totalPay;
  const insurable = totalPay;

  const qpp = quebec
    ? calculatePensionContribution({
        pensionableThisPeriod: pensionable,
        periods,
        pensionableMonths: input.pensionableMonths,
        ytd,
        plan: rates.qpp,
        kind: "qpp",
        exempt: input.cppQppExempt,
      })
    : ZERO_PENSION;

  const cpp = quebec
    ? ZERO_PENSION
    : calculatePensionContribution({
        pensionableThisPeriod: pensionable,
        periods,
        pensionableMonths: input.pensionableMonths,
        ytd,
        plan: rates.cpp,
        kind: "cpp",
        exempt: input.cppQppExempt,
      });

  const pension = quebec ? qpp : cpp;

  const ei = calculateEiPremium({
    insurableThisPeriod: insurable,
    quebec,
    exempt: input.eiExempt,
    ytd,
    rates: rates.ei,
  });

  const qpip = calculateQpipPremium({
    insurableThisPeriod: insurable,
    quebec,
    exempt: input.qpipExempt,
    ytd,
    rates: rates.qpip,
  });

  const qppAtMax = quebec && ytd.qppEmployee >= rates.qpp.maxEmployeeToYmpe - 0.005;
  const eiAtMax = ytd.eiEmployee >= (quebec ? rates.ei.maxEmployeeQuebec : rates.ei.maxEmployee) - 0.005;
  const qpipAtMax = quebec && ytd.qpipEmployee >= rates.qpip.maxEmployee - 0.005;

  const federal = calculateFederalTax({
    periods,
    periodicGross,
    bonus,
    rrspThisPeriod: round2(Math.max(0, input.rrspThisPeriod)),
    unionDuesThisPeriod: round2(Math.max(0, input.unionDuesThisPeriod)),
    additionalTaxRequested: round2(Math.max(0, input.additionalTaxRequested)),
    quebec,
    qppOrCppBaseThisPeriod: qppAtMax ? rates.qpp.maxBaseOnly / periods : pension.baseForCredit,
    qppOrCppAdditionalThisPeriod: pension.additionalDeductible,
    eiThisPeriod: eiAtMax ? (quebec ? rates.ei.maxEmployeeQuebec : rates.ei.maxEmployee) / periods : ei.employee,
    qpipThisPeriod: qpipAtMax ? rates.qpip.maxEmployee / periods : qpip.employee,
    td1FederalClaim: input.td1FederalClaim,
    projectedAnnualIncome: input.projectedAnnualIncome,
    pensionIncomeOnly: false,
    rates,
  });

  const provincial = quebec
    ? calculateQuebecTax({
        periods,
        periodicGross,
        bonus,
        rrspThisPeriod: round2(Math.max(0, input.rrspThisPeriod)),
        qppEmployeeThisPeriod: qpp.employee,
        qpipEmployeeThisPeriod: qpip.employee,
        additionalQuebecTaxRequested: round2(Math.max(0, input.additionalQuebecTaxRequested)),
        td1ProvincialClaim: input.td1ProvincialClaim,
        projectedAnnualIncome: input.projectedAnnualIncome,
        rates,
      })
    : calculateOtherProvincialTax({
        province: otherEmploymentProvince(input.provinceOfEmployment),
        periods,
        annualTaxableIncome: federal.annualTaxableIncome,
        cppBaseThisPeriod: cpp.baseForCredit,
        eiThisPeriod: ei.employee,
        td1ProvincialClaim: input.td1ProvincialClaim,
        additionalTaxRequested: round2(Math.max(0, input.additionalQuebecTaxRequested)),
        rates,
      });

  const levies = calculateEmployerLevies({
    quebec,
    grossPay: totalPay,
    ytd,
    totalPayroll: input.employer.totalPayroll,
    hsfSector: input.employer.hsfSector,
    hsfRateOverride: input.employer.hsfRateOverride,
    cnesstRate: input.employer.cnesstRate,
    rates,
  });

  const otherDeductions = round2(
    Math.max(0, input.rrspThisPeriod) + Math.max(0, input.unionDuesThisPeriod)
  );
  const employeeStatutory = round2(
    federal.federalTax +
      provincial.provincialTax +
      pension.employeeCombined +
      ei.employee +
      qpip.employee +
      otherDeductions
  );
  const employerStatutory = round2(
    pension.employerCombined + ei.employer + qpip.employer + levies.hsf + levies.cnt + levies.cnesst
  );
  const net = round2(totalPay - employeeStatutory);

  const result: PayPeriodResult = {
    year,
    provinceOfEmployment: input.provinceOfEmployment,
    periods,
    grossPay: totalPay,
    bonus,
    pensionable,
    insurable,
    cpp,
    qpp,
    ei,
    qpip,
    federalTax: federal.federalTax,
    provincialTax: provincial.provincialTax,
    levies,
    otherDeductions,
    employeeStatutory,
    employerStatutory,
    netPay: net,
    annualTaxableIncome: federal.annualTaxableIncome,
    t4: {},
    rl1: {},
  };
  result.t4 = t4Boxes(result);
  result.rl1 = rl1Boxes(result);
  return result;
}
