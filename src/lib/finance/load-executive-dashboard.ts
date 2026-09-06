import "server-only";

import { fetchUpcomingDeadlines } from "@/lib/finance/compliance";
import {
  fetchDashboardBillingData,
  fetchExecutiveExtras,
} from "@/lib/finance/dashboardData";
import {
  buildEstimatedDues,
  buildServiceKpiTrends,
  computeWorkedRevenueMetrics,
} from "@/lib/finance/dashboardKpis";
import { buildPartnerBreakdown, buildServiceTypeBreakdown } from "@/lib/finance/billingMetrics";
import {
  buildMonthlySeries,
  cumulativeMonthlySeries,
  hasChartData,
  seriesInSelectedPeriod,
} from "@/lib/finance/dashboardSeries";
import { buildFinancialSnapshot } from "@/lib/finance/financials";
import {
  currentFiscalYearRangeFixed,
  DEFAULT_FISCAL_YEAR_END_DAY,
  DEFAULT_FISCAL_YEAR_END_MONTH,
  periodPresets,
  type DateRange,
} from "@/lib/finance/fiscalPeriod";
import { fetchFinancialReportExtras, fetchGeneralLedgerData } from "@/lib/finance/glDataLoader";
import { DEFAULT_ESTIMATED_CORP_TAX_RATE } from "@/lib/finance/organizationSettings";
import { requireFinanceWorkspace } from "@/lib/finance/server";
import type { ComplianceDeadline } from "@/lib/finance/types";

export type ExecutiveDashboardSnapshot = {
  period: DateRange;
  presets: DateRange[];
  worked: ReturnType<typeof computeWorkedRevenueMetrics>;
  invoiced: number;
  recognized: number;
  collected: number;
  collectionRate: number | null;
  dues: ReturnType<typeof buildEstimatedDues>;
  chartSeries: ReturnType<typeof seriesInSelectedPeriod>;
  cumulativeSeries: ReturnType<typeof cumulativeMonthlySeries>;
  hasTrend: boolean;
  trends: ReturnType<typeof buildServiceKpiTrends>;
  partnerRows: ReturnType<typeof buildPartnerBreakdown>;
  serviceRows: ReturnType<typeof buildServiceTypeBreakdown>;
  deadlines: ComplianceDeadline[];
};

function resolvePeriod(presets: DateRange[], selected?: DateRange | null): DateRange {
  const fy = currentFiscalYearRangeFixed(
    DEFAULT_FISCAL_YEAR_END_MONTH,
    DEFAULT_FISCAL_YEAR_END_DAY,
  );
  if (selected) {
    const match = presets.find(
      (p) => p.label === selected.label && p.start === selected.start && p.end === selected.end,
    );
    if (match) return match;
  }
  return presets.find((p) => p.label === fy.label && p.start === fy.start && p.end === fy.end) ?? fy;
}

export async function loadExecutiveDashboard(
  selected?: DateRange | null,
): Promise<ExecutiveDashboardSnapshot> {
  const { db } = await requireFinanceWorkspace();
  const presets = periodPresets(DEFAULT_FISCAL_YEAR_END_MONTH, DEFAULT_FISCAL_YEAR_END_DAY);
  const period = resolvePeriod(presets, selected);

  const [billing, extras, { data: glData }, reportExtras, upcoming] = await Promise.all([
    fetchDashboardBillingData(db),
    fetchExecutiveExtras(db),
    fetchGeneralLedgerData(db),
    fetchFinancialReportExtras(db),
    fetchUpcomingDeadlines({ withinDays: 90, limit: 5 }, db),
  ]);

  const fin = buildFinancialSnapshot(
    {
      ...glData,
      bankTransactions: reportExtras.bankTransactions,
      settings: glData.settings ?? undefined,
    },
    period,
  );

  const monthlySeries = buildMonthlySeries(
    {
      payments: glData.payments,
      expenses: glData.expenses,
      payrollRuns: glData.payrollRuns,
      invoices: glData.invoices.map((inv) => ({
        id: inv.id,
        subtotal: inv.subtotal,
        invoice_date: inv.invoice_date,
        status: inv.status,
      })),
      timeEntries: billing.timeEntries,
      dividends: glData.dividends,
      corporateTax: glData.corporateTax,
      salesTaxRemitted: reportExtras.salesTaxRemitted,
      settings: glData.settings ?? undefined,
    },
    period,
  );

  const chartSeries = seriesInSelectedPeriod(monthlySeries, period);
  const dues = buildEstimatedDues(fin, {
    invoices: glData.invoices,
    payments: glData.payments,
    expenses: glData.expenses,
    employeeExpenses: glData.employeeExpenses,
    salesTaxRemittances: glData.salesTaxRemittances,
    estimatedCorpTaxRate: Number(
      glData.settings?.estimated_corp_tax_rate ?? DEFAULT_ESTIMATED_CORP_TAX_RATE,
    ),
    asOf: period.end || "9999-12-31",
  });

  return {
    period,
    presets,
    worked: computeWorkedRevenueMetrics(billing.timeEntries, period),
    invoiced: fin.income.invoicedSubtotal,
    recognized: fin.income.revenueSubtotal,
    collected: fin.cashIn,
    collectionRate: fin.billing.collectionRatePct,
    dues,
    chartSeries,
    cumulativeSeries: cumulativeMonthlySeries(chartSeries),
    hasTrend: hasChartData(chartSeries),
    trends: buildServiceKpiTrends(monthlySeries),
    partnerRows: buildPartnerBreakdown(
      billing.timeEntries,
      extras.invoices as {
        id: string;
        partner_id: string;
        subtotal: number;
        invoice_date: string;
        status: string;
      }[],
      glData.payments as { amount: number; payment_date?: string | null; invoice_id: string }[],
      billing.partners,
      period,
    ),
    serviceRows: buildServiceTypeBreakdown(
      billing.timeEntries,
      extras.lines as { invoice_id: string; subtotal: number; unit_label: string }[],
      extras.invoices as {
        id: string;
        partner_id: string;
        subtotal: number;
        invoice_date: string;
        status: string;
      }[],
      glData.payments as { amount: number; payment_date?: string | null; invoice_id: string }[],
      period,
    ),
    deadlines: upcoming,
  };
}
