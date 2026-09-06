import type { PayrollRun } from "../types";
import { EMPTY_PAYROLL_YTD, type PayrollYtd } from "./types";

export function ytdFromPayrollRuns(
  runs: Pick<
    PayrollRun,
    | "payment_date"
    | "gross_pay"
    | "federal_tax"
    | "provincial_tax"
    | "cpp_employee"
    | "ei_employee"
    | "qpip_employee"
    | "cpp_employer"
  >[],
  year: number,
  beforePaymentDate?: string
): PayrollYtd {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const ytd = { ...EMPTY_PAYROLL_YTD };
  for (const run of runs) {
    if (run.payment_date < start || run.payment_date > end) continue;
    if (beforePaymentDate && run.payment_date >= beforePaymentDate) continue;
    const gross = Number(run.gross_pay) || 0;
    const qpp = Number(run.cpp_employee) || 0;
    ytd.grossPay += gross;
    ytd.pensionableEarnings += gross;
    ytd.insurableEarnings += gross;
    ytd.qpipInsurableEarnings += gross;
    ytd.qppEmployee += qpp;
    ytd.cppEmployee += qpp;
    ytd.eiEmployee += Number(run.ei_employee) || 0;
    ytd.qpipEmployee += Number(run.qpip_employee) || 0;
    ytd.federalTax += Number(run.federal_tax) || 0;
    ytd.provincialTax += Number(run.provincial_tax) || 0;
    ytd.cntAssessable += gross;
    ytd.cnesstAssessable += gross;
  }
  return ytd;
}

export function applyPeriodToYtd(ytd: PayrollYtd, period: Partial<PayrollYtd>): PayrollYtd {
  const next = { ...ytd };
  for (const key of Object.keys(EMPTY_PAYROLL_YTD) as (keyof PayrollYtd)[]) {
    next[key] = Number(next[key]) + Number(period[key] ?? 0);
  }
  return next;
}
