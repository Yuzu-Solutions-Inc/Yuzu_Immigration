export type FinanceQueryCall = {
  prop: string;
  args: unknown[];
};

/** Tables the finance client may read through the server query action. */
export const FINANCE_QUERY_TABLES = [
  "accounting_adjustments",
  "bank_transactions",
  "compliance_deadlines",
  "corporate_tax_records",
  "dividend_allocations",
  "dividends",
  "document_attachments",
  "employee_expenses",
  "employees",
  "expenses",
  "fiscal_period_closes",
  "invoice_line_items",
  "invoices",
  "organization_settings",
  "partners",
  "payments",
  "payroll_runs",
  "project_week_plans",
  "projects",
  "sales_tax_lines",
  "sales_tax_periods",
  "shareholders",
  "time_entries",
  "time_entry_lines",
] as const;

export type FinanceQueryTable = (typeof FINANCE_QUERY_TABLES)[number];

const TABLE_SET = new Set<string>(FINANCE_QUERY_TABLES);

/** PostgREST filter/builder methods allowed on a finance select. */
export const FINANCE_READ_METHODS = [
  "eq",
  "gte",
  "gt",
  "ilike",
  "in",
  "is",
  "like",
  "limit",
  "lte",
  "lt",
  "maybeSingle",
  "neq",
  "order",
  "range",
  "single",
] as const;

const READ_METHOD_SET = new Set<string>(FINANCE_READ_METHODS);

export function isFinanceQueryTable(table: string): table is FinanceQueryTable {
  return TABLE_SET.has(table);
}

export function parseFinanceQuery(
  table: unknown,
  calls: unknown,
): { table: FinanceQueryTable; calls: FinanceQueryCall[] } {
  if (typeof table !== "string" || !isFinanceQueryTable(table)) {
    throw new Error("invalid_table");
  }
  if (!Array.isArray(calls) || calls.length === 0 || calls.length > 24) {
    throw new Error("invalid_query");
  }

  const parsed: FinanceQueryCall[] = [];
  for (const call of calls) {
    if (!call || typeof call !== "object" || Array.isArray(call)) {
      throw new Error("invalid_query");
    }
    const prop = (call as { prop?: unknown }).prop;
    const args = (call as { args?: unknown }).args;
    if (typeof prop !== "string" || !Array.isArray(args) || args.length > 4) {
      throw new Error("invalid_query");
    }
    parsed.push({ prop, args: [...args] });
  }

  const [first, ...rest] = parsed;
  if (first.prop !== "select") {
    throw new Error("invalid_query");
  }
  if (typeof first.args[0] !== "string" || first.args[0].length === 0 || first.args[0].length > 4000) {
    throw new Error("invalid_query");
  }
  if (first.args.length > 2) {
    throw new Error("invalid_query");
  }

  for (const call of rest) {
    if (!READ_METHOD_SET.has(call.prop)) {
      throw new Error("invalid_query");
    }
  }

  return { table, calls: parsed };
}
