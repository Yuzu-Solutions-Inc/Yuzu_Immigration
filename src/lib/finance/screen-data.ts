import type { FinanceDb } from "@/lib/finance/db";
import { computeUnbilledWip, type MetricsProject } from "@/lib/finance/billingMetrics";
import { FIXED_PROJECT_SELECT, TIME_ENTRY_SELECT } from "@/lib/finance/dashboardData";
import { buildFinancialSnapshot, payrollEmployerTotal } from "@/lib/finance/financials";
import { allTimeRange } from "@/lib/finance/fiscalPeriod";
import { addDays, todayIso } from "@/lib/finance/format";
import { fetchGeneralLedgerData } from "@/lib/finance/glDataLoader";
import { invoiceBalance } from "@/lib/finance/invoice";
import { weeksForNextMonths, type PipelineProject } from "@/lib/finance/pipeline";
import { entriesToMetrics, type TimeEntrySheetSource, type TimeEntryWithLines } from "@/lib/finance/timeEntries";
import type {
  AccountingAdjustment,
  BankTransaction,
  CorporateTaxRecord,
  Dividend,
  Employee,
  EmployeeExpense,
  Expense,
  Invoice,
  OrganizationSettings,
  Partner,
  Payment,
  PayrollRun,
  Project,
  ProjectWeekPlan,
  SalesTaxPeriod,
  Shareholder,
} from "@/lib/finance/types";

export const TIME_SHEET_SELECT =
  "*, time_entry_lines(id, item_name, hours, notes, billable, sort_order), projects(name, default_hourly_rate, billing_type, fixed_price, partner_id, partners(legal_name)), employees(first_name, last_name), invoices(invoice_number)";

export type BillingMetrics = {
  unbilledHours: number;
  unbilledAmount: number;
  fixedWip: number;
  draftInvoices: number;
};

export type CompensationMetrics = {
  activeEmployees: number;
  payrollCostYtd: number;
  dividendsYtd: number;
};

export type EngagementsScreenData = {
  projects: Project[];
  partners: Partner[];
};

export type PipelineScreenData = {
  projects: PipelineProject[];
  plans: ProjectWeekPlan[];
  timeEntries: TimeEntrySheetSource[];
  error: string | null;
};

export type InvoicesScreenData = {
  invoices: Invoice[];
  partners: Partner[];
  settings: OrganizationSettings | null;
};

export type TimeScreenData = {
  allProjects: Project[];
  entries: TimeEntryWithLines[];
  employees: Employee[];
};

export type EmployeesScreenData = {
  employees: Employee[];
};

export type ShareholdersScreenData = {
  rows: Shareholder[];
  employees: Employee[];
  loadError: string | null;
};

export type PayrollScreenData = {
  employees: Employee[];
  rows: PayrollRun[];
  shareholders: Pick<Shareholder, "employee_id" | "shares_held" | "active">[];
  levyRates: { hsf: number; cnesst: number };
};

export type DividendsScreenData = {
  rows: Dividend[];
  shareholders: Shareholder[];
};

export type EmployeeExpensesScreenData = {
  rows: EmployeeExpense[];
  employees: Employee[];
  settings: OrganizationSettings | null;
};

export type AdjustmentsScreenData = {
  rows: AccountingAdjustment[];
  error: string | null;
};

export type SalesTaxScreenData = {
  rows: SalesTaxPeriod[];
};

export type CorporateTaxScreenData = {
  rows: CorporateTaxRecord[];
};

export type InvoiceWithPaid = Invoice & { paid: number; balance: number };

export type BankPayrollRun = {
  id: string;
  payment_date: string;
  pay_period_start: string;
  pay_period_end: string;
  net_pay: number;
  remittance_status: string | null;
  remittance_date: string | null;
  remittance_reference: string | null;
  gross_pay: number;
  federal_tax: number;
  provincial_tax: number;
  cpp_employee: number;
  ei_employee: number;
  qpip_employee: number;
  cpp_employer: number;
  ei_employer: number;
  qpip_employer: number;
  other_deductions: number;
  employer_benefits: number;
  employees?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

export type BankScreenData = {
  rows: BankTransaction[];
  invoices: InvoiceWithPaid[];
  partners: Partner[];
  settings: OrganizationSettings | null;
  bookCash: number;
  paymentMap: Record<string, Payment>;
  expenseMap: Record<string, Expense>;
  payrollRuns: BankPayrollRun[];
  dividends: Dividend[];
  salesTaxPeriods: SalesTaxPeriod[];
  corpTaxRecords: CorporateTaxRecord[];
};

const PIPELINE_HORIZON_MONTHS = 6;

export async function fetchBillingMetrics(db: FinanceDb): Promise<BillingMetrics> {
  const [{ data: entries }, { data: fixedProjects }, { data: drafts }] = await Promise.all([
    db.from("time_entries").select(TIME_ENTRY_SELECT),
    db.from("projects").select(FIXED_PROJECT_SELECT),
    db.from("invoices").select("id").eq("status", "draft"),
  ]);
  const wip = computeUnbilledWip(
    entriesToMetrics(entries ?? []),
    (fixedProjects ?? []) as MetricsProject[],
  );
  return {
    unbilledHours: wip.hours,
    unbilledAmount: wip.amount,
    fixedWip: wip.fixedAmount,
    draftInvoices: drafts?.length ?? 0,
  };
}

export async function fetchCompensationMetrics(db: FinanceDb): Promise<CompensationMetrics> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [{ data: employees }, { data: payroll }, { data: dividends }] = await Promise.all([
    db.from("employees").select("id, active"),
    db
      .from("payroll_runs")
      .select(
        "payment_date, gross_pay, cpp_employer, ei_employer, qpip_employer, employer_benefits, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, other_deductions",
      )
      .gte("payment_date", yearStart),
    db.from("dividends").select("total_amount, declared_date").gte("declared_date", yearStart),
  ]);
  return {
    activeEmployees: (employees ?? []).filter((e) => e.active).length,
    payrollCostYtd: (payroll ?? []).reduce((s, p) => s + payrollEmployerTotal(p), 0),
    dividendsYtd: (dividends ?? []).reduce((s, d) => s + Number(d.total_amount), 0),
  };
}

export async function fetchEngagementsScreen(db: FinanceDb): Promise<EngagementsScreenData> {
  const [p, c] = await Promise.all([
    db.from("projects").select("*, partners(legal_name, kind)").order("name"),
    db.from("partners").select("*").order("legal_name"),
  ]);
  return {
    projects: (p.data as Project[]) ?? [],
    partners: (c.data as Partner[]) ?? [],
  };
}

export async function fetchPipelineScreen(db: FinanceDb): Promise<PipelineScreenData> {
  const horizonWeeks = weeksForNextMonths(todayIso(), PIPELINE_HORIZON_MONTHS);
  const periodEnd = addDays(horizonWeeks[horizonWeeks.length - 1], 6);
  const [p, w, t] = await Promise.all([
    db
      .from("projects")
      .select(
        "id, name, billing_type, default_hourly_rate, fixed_price, status, partner_id, partners(legal_name)",
      )
      .order("name"),
    db.from("project_week_plans").select("*"),
    db
      .from("time_entries")
      .select(
        "id, entry_date, hours, rate_override, billable, invoice_id, project_id, description, time_entry_lines(hours, billable, item_name)",
      )
      .lte("entry_date", periodEnd),
  ]);
  if (p.error) return { projects: [], plans: [], timeEntries: [], error: p.error.message };
  if (w.error) {
    return {
      projects: [],
      plans: [],
      timeEntries: [],
      error: w.error.message.includes("project_week_plans")
        ? "Table project_week_plans manquante — exécutez la migration supabase/migrations/20260724230000_project_week_plans.sql"
        : w.error.message,
    };
  }
  if (t.error) return { projects: [], plans: [], timeEntries: [], error: t.error.message };
  return {
    projects: (p.data as PipelineProject[]) ?? [],
    plans: (w.data as ProjectWeekPlan[]) ?? [],
    timeEntries: (t.data as TimeEntrySheetSource[]) ?? [],
    error: null,
  };
}

export async function fetchInvoicesScreen(db: FinanceDb): Promise<InvoicesScreenData> {
  const [inv, cli, set] = await Promise.all([
    db.from("invoices").select("*, partners(legal_name)").order("invoice_date", { ascending: false }),
    db.from("partners").select("*").order("legal_name"),
    db.from("organization_settings").select("*").maybeSingle(),
  ]);
  return {
    invoices: (inv.data as Invoice[]) ?? [],
    partners: cli.data ?? [],
    settings: set.data,
  };
}

export async function fetchTimeScreen(db: FinanceDb): Promise<TimeScreenData> {
  const [p, entries, emp] = await Promise.all([
    db.from("projects").select("*, partners(legal_name)").order("name"),
    db.from("time_entries").select(TIME_SHEET_SELECT).order("entry_date", { ascending: false }),
    db.from("employees").select("*").eq("active", true).order("last_name").order("first_name"),
  ]);
  return {
    allProjects: (p.data as Project[]) ?? [],
    entries: (entries.data as TimeEntryWithLines[]) ?? [],
    employees: (emp.data as Employee[]) ?? [],
  };
}

export async function fetchEmployeesScreen(db: FinanceDb): Promise<EmployeesScreenData> {
  const { data } = await db.from("employees").select("*").order("last_name").order("first_name");
  return { employees: (data as Employee[]) ?? [] };
}

export async function fetchShareholdersScreen(db: FinanceDb): Promise<ShareholdersScreenData> {
  const [sh, emp] = await Promise.all([
    db.from("shareholders").select("*, employees(first_name, last_name)").order("legal_name"),
    db.from("employees").select("id, first_name, last_name, active").eq("active", true).order("last_name"),
  ]);
  return {
    rows: (sh.data as Shareholder[]) ?? [],
    employees: (emp.data as Employee[]) ?? [],
    loadError: sh.error?.message.includes("shareholders") ? "missing" : null,
  };
}

export async function fetchPayrollScreen(db: FinanceDb): Promise<PayrollScreenData> {
  const [emp, pay, settings, sh] = await Promise.all([
    db.from("employees").select("*").order("last_name").order("first_name"),
    db
      .from("payroll_runs")
      .select("*, employees(first_name, last_name)")
      .order("payment_date", { ascending: false }),
    db.from("organization_settings").select("hsf_rate, cnesst_rate").maybeSingle(),
    db.from("shareholders").select("employee_id, shares_held, active"),
  ]);
  return {
    employees: (emp.data as Employee[]) ?? [],
    rows: (pay.data as PayrollRun[]) ?? [],
    shareholders: sh.data ?? [],
    levyRates: {
      hsf: Number(settings.data?.hsf_rate ?? 0.0165),
      cnesst: Number(settings.data?.cnesst_rate ?? 0.01),
    },
  };
}

export async function fetchDividendsScreen(db: FinanceDb): Promise<DividendsScreenData> {
  const [div, sh] = await Promise.all([
    db
      .from("dividends")
      .select(
        "*, dividend_allocations(id, amount, shareholder_id, employee_id, shareholders(legal_name), employees(first_name, last_name))",
      )
      .order("declared_date", { ascending: false }),
    db.from("shareholders").select("*").eq("active", true).order("legal_name"),
  ]);
  return {
    rows: (div.data as Dividend[]) ?? [],
    shareholders: (sh.data as Shareholder[]) ?? [],
  };
}

export async function fetchEmployeeExpensesScreen(db: FinanceDb): Promise<EmployeeExpensesScreenData> {
  const [{ data }, { data: emp }, { data: set }] = await Promise.all([
    db
      .from("employee_expenses")
      .select("*, employees(first_name, last_name), payroll_runs(payment_date)")
      .order("expense_date", { ascending: false }),
    db.from("employees").select("*").eq("active", true).order("last_name").order("first_name"),
    db.from("organization_settings").select("*").maybeSingle(),
  ]);
  return {
    rows: (data as EmployeeExpense[]) ?? [],
    employees: (emp as Employee[]) ?? [],
    settings: set ?? null,
  };
}

export async function fetchAdjustmentsScreen(db: FinanceDb): Promise<AdjustmentsScreenData> {
  const { data, error } = await db
    .from("accounting_adjustments")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) {
    return {
      rows: [],
      error: error.message.includes("accounting_adjustments") ? "missing" : error.message,
    };
  }
  return { rows: (data as AccountingAdjustment[]) ?? [], error: null };
}

export async function fetchSalesTaxScreen(db: FinanceDb): Promise<SalesTaxScreenData> {
  const { data } = await db
    .from("sales_tax_periods")
    .select("*")
    .order("period_end", { ascending: false });
  return { rows: (data as SalesTaxPeriod[]) ?? [] };
}

export async function fetchCorporateTaxScreen(db: FinanceDb): Promise<CorporateTaxScreenData> {
  const { data } = await db
    .from("corporate_tax_records")
    .select("*")
    .order("due_date", { ascending: true });
  return { rows: (data as CorporateTaxRecord[]) ?? [] };
}

export async function fetchBankScreen(db: FinanceDb): Promise<BankScreenData> {
  const [bank, inv, pay, exp, part, set, payroll, div, corpTax, salesTax] = await Promise.all([
    db.from("bank_transactions").select("*").order("transaction_date", { ascending: false }),
    db
      .from("invoices")
      .select("*, partners(legal_name)")
      .neq("status", "void")
      .order("invoice_date", { ascending: false }),
    db.from("payments").select("*, invoices(invoice_number, total, partner_id)"),
    db.from("expenses").select("*"),
    db.from("partners").select("*").order("legal_name"),
    db.from("organization_settings").select("*").maybeSingle(),
    db
      .from("payroll_runs")
      .select(
        "id, payment_date, pay_period_start, pay_period_end, net_pay, remittance_status, remittance_date, remittance_reference, gross_pay, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, cpp_employer, ei_employer, qpip_employer, other_deductions, employer_benefits, employees(first_name, last_name)",
      )
      .order("payment_date", { ascending: false }),
    db
      .from("dividends")
      .select("id, declared_date, payment_date, total_amount, paid_amount, description, status")
      .order("declared_date", { ascending: false }),
    db.from("corporate_tax_records").select("*").order("due_date", { ascending: true }),
    db.from("sales_tax_periods").select("*").order("period_end", { ascending: false }),
  ]);

  const paidMap: Record<string, number> = {};
  for (const p of pay.data ?? []) {
    paidMap[p.invoice_id] = (paidMap[p.invoice_id] ?? 0) + Number(p.amount);
  }
  const invoices = ((inv.data ?? []) as Invoice[]).map((i) => {
    const paid = paidMap[i.id] ?? 0;
    return { ...i, paid, balance: invoiceBalance(Number(i.total), paid) };
  });
  const payments = (pay.data as Payment[]) ?? [];
  const expenses = (exp.data as Expense[]) ?? [];
  const { data: glData } = await fetchGeneralLedgerData(db);
  const fin = buildFinancialSnapshot(
    {
      ...glData,
      bankTransactions: bank.data ?? [],
      settings: set.data ?? glData.settings ?? undefined,
    },
    allTimeRange(),
  );
  return {
    rows: (bank.data as BankTransaction[]) ?? [],
    invoices,
    partners: (part.data as Partner[]) ?? [],
    settings: set.data,
    bookCash: fin.netCash,
    paymentMap: Object.fromEntries(payments.map((p) => [p.id, p])),
    expenseMap: Object.fromEntries(expenses.map((e) => [e.id, e])),
    payrollRuns: (payroll.data ?? []) as BankPayrollRun[],
    dividends: (div.data as Dividend[]) ?? [],
    salesTaxPeriods: (salesTax.data as SalesTaxPeriod[]) ?? [],
    corpTaxRecords: (corpTax.data as CorporateTaxRecord[]) ?? [],
  };
}
