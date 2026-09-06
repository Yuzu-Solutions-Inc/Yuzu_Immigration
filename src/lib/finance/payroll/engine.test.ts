import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculatePayPeriod } from "./engine";
import { hsfContributionRate } from "./employer-levies";
import { loadPayrollRates } from "./rates";
import { EMPTY_PAYROLL_YTD, type PayPeriodInput } from "./types";

function qcWeekly(overrides: Partial<PayPeriodInput> = {}): PayPeriodInput {
  return {
    paymentDate: "2026-03-13",
    payFrequency: "weekly",
    grossPay: 1300,
    bonus: 0,
    rrspThisPeriod: 0,
    unionDuesThisPeriod: 0,
    additionalTaxRequested: 0,
    additionalQuebecTaxRequested: 0,
    provinceOfEmployment: "QC",
    td1FederalClaim: null,
    td1ProvincialClaim: null,
    projectedAnnualIncome: null,
    pensionableMonths: 12,
    cppQppExempt: false,
    eiExempt: false,
    qpipExempt: false,
    ytd: { ...EMPTY_PAYROLL_YTD },
    employer: {
      totalPayroll: 200_000,
      hsfSector: "other",
      hsfRateOverride: 0.0165,
      cnesstRate: 0.01,
    },
    ...overrides,
  };
}

describe("CRA T4032-QC 2026 worked examples", () => {
  it("matches the $1,300 weekly + $80 RRSP federal example ($95.01)", () => {
    const result = calculatePayPeriod(qcWeekly({ rrspThisPeriod: 80 }));

    assert.equal(result.qpp.employee, 77.66);
    assert.equal(result.ei.employee, 16.9);
    assert.equal(result.qpip.employee, 5.59);
    assert.equal(result.qpp.baseForCredit, 65.33);
    assert.equal(result.qpp.additionalDeductible, 12.33);
    assert.equal(result.annualTaxableIncome, 62798.84);
    assert.equal(result.federalTax, 95.01);
  });

  it("matches QPP2 Factor W when YTD pensionable is above YMPE", () => {
    const result = calculatePayPeriod(
      qcWeekly({
        grossPay: 1600,
        ytd: {
          ...EMPTY_PAYROLL_YTD,
          pensionableEarnings: 75200,
          qppEmployee: 4479.3,
          qpp2Employee: 24,
          insurableEarnings: 68900,
          eiEmployee: 895.7,
          qpipInsurableEarnings: 0,
        },
      })
    );

    assert.equal(result.qpp.employee, 0);
    assert.equal(result.qpp.employeeSecond, 64);
    assert.equal(result.ei.employee, 0);
    assert.equal(result.qpip.employee, 6.88);
    assert.equal(result.federalTax, 150.19);
  });
});

describe("statutory contribution ceilings 2026", () => {
  const rates = loadPayrollRates(2026);

  it("stops QPP at the combined YMPE maximum across a year of monthly pays", () => {
    let ytd = { ...EMPTY_PAYROLL_YTD };
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const result = calculatePayPeriod(
        qcWeekly({
          payFrequency: "monthly",
          paymentDate: `2026-${String(m).padStart(2, "0")}-28`,
          grossPay: 8000,
          ytd,
        })
      );
      total += result.qpp.employee;
      ytd = {
        ...ytd,
        pensionableEarnings: ytd.pensionableEarnings + result.pensionable,
        qppEmployee: ytd.qppEmployee + result.qpp.employee,
        qpp2Employee: ytd.qpp2Employee + result.qpp.employeeSecond,
      };
    }
    assert.ok(Math.abs(total - rates.qpp.maxEmployeeToYmpe) < 0.05);
  });

  it("caps Quebec EI at $895.70", () => {
    const result = calculatePayPeriod(qcWeekly({ grossPay: 80_000, payFrequency: "monthly" }));
    assert.ok(result.ei.employee <= rates.ei.maxEmployeeQuebec);
  });

  it("uses the reduced Quebec EI rate, not the rest-of-Canada rate", () => {
    const qc = calculatePayPeriod(qcWeekly({ grossPay: 1000 }));
    const on = calculatePayPeriod({ ...qcWeekly({ grossPay: 1000 }), provinceOfEmployment: "ON" });
    assert.equal(qc.ei.employee, 13);
    assert.equal(on.ei.employee, 16.3);
    assert.equal(qc.qpip.employee, 4.3);
    assert.equal(on.qpip.employee, 0);
    assert.equal(on.cpp.employee > 0, true);
    assert.equal(qc.cpp.employee, 0);
  });
});

describe("pay frequency annualization", () => {
  it("produces federal tax within $1 of the weekly run when salary is the same", () => {
    const annual = 67_600;
    const weekly = calculatePayPeriod(qcWeekly({ grossPay: annual / 52 }));
    const biweekly = calculatePayPeriod(qcWeekly({ payFrequency: "biweekly", grossPay: annual / 26 }));
    const semimonthly = calculatePayPeriod(qcWeekly({ payFrequency: "semimonthly", grossPay: annual / 24 }));
    const monthly = calculatePayPeriod(qcWeekly({ payFrequency: "monthly", grossPay: annual / 12 }));

    const annualize = (r: ReturnType<typeof calculatePayPeriod>) => r.federalTax * r.periods;
    const base = annualize(weekly);
    for (const other of [biweekly, semimonthly, monthly]) {
      assert.ok(Math.abs(annualize(other) - base) < 1, `delta ${annualize(other) - base}`);
    }
  });
});

describe("Quebec employer levies", () => {
  const rates = loadPayrollRates(2026);

  it("uses 1.65% HSF for other-sector payroll at or under $1M", () => {
    assert.equal(hsfContributionRate(1_000_000, "other", rates.hsf), 0.0165);
  });

  it("interpolates HSF between $1M and $7.8M", () => {
    const mid = hsfContributionRate(4_000_000, "other", rates.hsf);
    assert.ok(mid > 0.0165 && mid < 0.0426);
  });

  it("computes CNT at 0.06% up to the $103,000 ceiling", () => {
    const result = calculatePayPeriod(qcWeekly({ grossPay: 2000 }));
    assert.equal(result.levies.cnt, 1.2);
    const over = calculatePayPeriod(
      qcWeekly({
        grossPay: 5000,
        ytd: { ...EMPTY_PAYROLL_YTD, cntAssessable: 103000 },
      })
    );
    assert.equal(over.levies.cnt, 0);
  });
});
