-- Additive Finance schema on MyConsultant, matching Yuzu Solutions Inc.
-- Immigration tables/data are untouched. file_status already renamed from project_status.

create table if not exists public.organization_modules (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module_id text not null,
  enabled_at timestamptz not null default now(),
  primary key (organization_id, module_id),
  constraint organization_modules_id_chk check (
    module_id in ('finance','immigration','bookings','services','contracts','payments')
  )
);
comment on table public.organization_modules is
  'Enabled Dossierly product modules per organization. Missing rows fall back in the app.';

create table if not exists public.organization_settings (
  user_id uuid not null references auth.users (id) on delete restrict,
  company_legal_name text not null default 'Les Solutions Yuzu Inc.',
  company_operating_name text default 'Yuzu Solutions',
  address_line1 text,
  city text,
  province text default 'QC',
  postal_code text,
  country text default 'Canada',
  neq text,
  gst_number text,
  qst_number text,
  email text,
  phone text,
  charge_gst boolean not null default false,
  charge_qst boolean not null default false,
  gst_rate numeric(6,5) not null default 0.05,
  qst_rate numeric(6,5) not null default 0.09975,
  invoice_prefix text not null default 'YUZU',
  payment_terms_days integer not null default 30,
  payment_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  interac_email text,
  bank_institution text,
  bank_transit text,
  bank_account text,
  billing_inquiries_email text,
  payment_instructions_fr text,
  payment_instructions_en text,
  share_capital numeric(12,2) not null default 0,
  opening_retained_earnings numeric(12,2) not null default 0,
  opening_cash_balance numeric(12,2) not null default 0,
  fiscal_year_end_month integer not null default 6,
  fiscal_year_end_day integer not null default 30,
  estimated_corp_tax_rate numeric(6,5) not null default 0.205,
  opening_balance_date date,
  wip_accrual_enabled boolean not null default false,
  hsf_rate numeric(6,5) not null default 0.0165,
  cnesst_rate numeric(6,5) not null default 0.01,
  invoice_penalty_monthly_pct numeric(6,5) not null default 0.02,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  primary key (organization_id),
  constraint organization_settings_fiscal_year_end_day_check check (fiscal_year_end_day >= 1 and fiscal_year_end_day <= 31),
  constraint organization_settings_fiscal_year_end_month_check check (fiscal_year_end_month >= 1 and fiscal_year_end_month <= 12)
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  legal_name text not null,
  contact_name text,
  email text,
  address_line1 text,
  city text,
  province text default 'QC',
  postal_code text,
  country text default 'Canada',
  language text default 'fr',
  payment_terms_days integer default 30,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind public.partner_kind not null default 'customer',
  invoice_penalty_monthly_pct numeric(6,5) not null default 0.02,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  phone text,
  immigration_status text,
  status_expires_at date,
  preferred_locale text not null default 'fr'
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email text,
  yearly_salary numeric(12,2) not null,
  pay_frequency public.pay_frequency not null default 'biweekly',
  estimated_yearly_income numeric(12,2),
  active boolean not null default true,
  hire_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  over_40_percent_voting boolean not null default false,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  province_of_employment text not null default 'QC',
  td1_federal_claim numeric,
  td1_provincial_claim numeric,
  pensionable_months integer not null default 12,
  cpp_qpp_exempt boolean not null default false,
  qpip_exempt boolean not null default false,
  constraint employees_yearly_salary_check check (yearly_salary >= 0),
  constraint employees_estimated_yearly_income_check check (estimated_yearly_income is null or estimated_yearly_income >= 0)
);

create table if not exists public.shareholders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  legal_name text not null,
  email text,
  employee_id uuid references public.employees (id) on delete set null,
  shares_held numeric(12,4) not null default 1,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint shareholders_shares_held_check check (shares_held > 0)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  partner_id uuid not null references public.partners (id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  gst numeric(12,2) not null default 0,
  qst numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status public.invoice_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  include_sales_tax boolean not null default false,
  currency text not null default 'CAD',
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint invoices_currency_cad_check check (currency = 'CAD')
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  partner_id uuid not null references public.partners (id) on delete cascade,
  name text not null,
  status public.project_status not null default 'active',
  default_hourly_rate numeric(10,2) not null,
  currency text not null default 'CAD',
  billing_type text not null default 'hourly',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fixed_price numeric(10,2),
  invoice_id uuid references public.invoices (id) on delete set null,
  po_number text,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint projects_billing_type_check check (billing_type in ('hourly','fixed')),
  constraint projects_fixed_price_check check (fixed_price is null or fixed_price >= 0)
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  entry_date date not null,
  hours numeric(6,2) not null,
  description text,
  billable boolean not null default true,
  rate_override numeric(10,2),
  invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  employee_id uuid references public.employees (id) on delete restrict,
  notes text,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint time_entries_hours_check check (hours > 0)
);

create table if not exists public.time_entry_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  item_name text not null,
  hours numeric(6,2) not null,
  notes text,
  billable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint time_entry_lines_hours_check check (hours > 0)
);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  time_entry_id uuid references public.time_entries (id) on delete set null,
  line_date date,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_label text not null default 'forfait',
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null,
  gst numeric(12,2) not null default 0,
  qst numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint invoice_line_items_gst_check check (gst >= 0),
  constraint invoice_line_items_qst_check check (qst >= 0),
  constraint invoice_line_items_quantity_check check (quantity > 0),
  constraint invoice_line_items_subtotal_check check (subtotal >= 0),
  constraint invoice_line_items_total_check check (total >= 0),
  constraint invoice_line_items_unit_price_check check (unit_price >= 0)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(12,2) not null,
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  source text not null default 'other',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  constraint payments_amount_check check (amount > 0),
  constraint payments_source_chk check (source in ('stripe','bank','other','manual'))
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  pay_period_start date not null,
  pay_period_end date not null,
  payment_date date not null default current_date,
  gross_pay numeric(12,2) not null,
  federal_tax numeric(12,2) not null default 0,
  provincial_tax numeric(12,2) not null default 0,
  cpp_employee numeric(12,2) not null default 0,
  ei_employee numeric(12,2) not null default 0,
  qpip_employee numeric(12,2) not null default 0,
  cpp_employer numeric(12,2) not null default 0,
  ei_employer numeric(12,2) not null default 0,
  qpip_employer numeric(12,2) not null default 0,
  other_deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null,
  employer_benefits numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  employee_id uuid references public.employees (id) on delete restrict,
  reimbursement_total numeric(12,2) not null default 0,
  remittance_status text not null default 'pending',
  remittance_date date,
  remittance_reference text,
  hsf_employer numeric(12,2) not null default 0,
  cnesst_employer numeric(12,2) not null default 0,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  cnt_employer numeric not null default 0,
  qpp2_employee numeric not null default 0,
  qpp2_employer numeric not null default 0,
  engine_year integer,
  t4_boxes jsonb not null default '{}'::jsonb,
  rl1_boxes jsonb not null default '{}'::jsonb,
  constraint payroll_runs_remittance_status_check check (remittance_status in ('pending','remitted'))
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  expense_date date not null default current_date,
  vendor text not null,
  category public.expense_category not null default 'other',
  description text,
  amount numeric(12,2) not null,
  gst numeric(12,2) not null default 0,
  qst numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  paid boolean not null default true,
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint expenses_amount_check check (amount >= 0)
);

create table if not exists public.employee_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  expense_date date not null default current_date,
  vendor text not null,
  category public.expense_category not null default 'other',
  description text,
  amount numeric(12,2) not null,
  gst numeric(12,2) not null default 0,
  qst numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  taxable boolean not null default false,
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint employee_expenses_amount_check check (amount >= 0)
);

create table if not exists public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  entity_type public.document_entity_type not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint document_attachments_size_bytes_check check (size_bytes > 0)
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  transaction_date date not null,
  description text not null,
  amount numeric(12,2) not null,
  reconciled boolean not null default false,
  match_source text,
  match_id uuid,
  source_format text,
  transaction_code text,
  import_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint bank_transactions_match_source_check check (match_source is null or match_source in ('payment','expense','payroll','dividend','sales_tax','corporate_tax','manual','interest','capital','opening')),
  constraint bank_transactions_source_format_check check (source_format is null or source_format in ('chequing','credit_card','manual'))
);

create table if not exists public.accounting_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  adjustment_type text not null,
  description text not null,
  start_date date not null,
  end_date date,
  total_amount numeric(12,2),
  monthly_amount numeric(12,2),
  debit_account text not null,
  credit_account text not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint accounting_adjustments_adjustment_type_check check (adjustment_type in ('prepaid','accrual','depreciation','manual'))
);

create table if not exists public.compliance_deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  title text not null,
  category public.compliance_deadline_category not null default 'other',
  due_date date not null,
  status public.compliance_deadline_status not null default 'open',
  source public.compliance_deadline_source not null default 'manual',
  source_key text,
  amount numeric(12,2),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict
);

create table if not exists public.corporate_tax_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  fiscal_year text not null,
  label text not null,
  tax_authority text not null default 'CRA',
  due_date date,
  amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  paid_date date,
  status public.corp_tax_status not null default 'estimated',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict
);

create table if not exists public.dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  payment_date date,
  total_amount numeric(12,2) not null,
  employee_count integer not null,
  amount_per_employee numeric(12,2) not null,
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  declared_date date not null default current_date,
  status text not null default 'declared',
  paid_amount numeric(12,2) not null default 0,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint dividends_amount_per_employee_check check (amount_per_employee >= 0),
  constraint dividends_employee_count_check check (employee_count > 0),
  constraint dividends_paid_amount_check check (paid_amount >= 0),
  constraint dividends_status_check check (status in ('declared','paid')),
  constraint dividends_total_amount_check check (total_amount > 0)
);

create table if not exists public.dividend_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  dividend_id uuid not null references public.dividends (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete restrict,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  shareholder_id uuid references public.shareholders (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint dividend_allocations_amount_check check (amount >= 0),
  unique (dividend_id, employee_id)
);

create table if not exists public.fiscal_period_closes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  period_end date not null,
  notes text,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict
);

create table if not exists public.sales_tax_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  filing_due_date date,
  gst_collected numeric(12,2) not null default 0,
  qst_collected numeric(12,2) not null default 0,
  gst_itc numeric(12,2) not null default 0,
  qst_itr numeric(12,2) not null default 0,
  gst_net numeric(12,2) not null default 0,
  qst_net numeric(12,2) not null default 0,
  status public.tax_period_status not null default 'open',
  filed_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  auto_synced_at timestamptz,
  organization_id uuid not null references public.organizations (id) on delete restrict
);

create table if not exists public.payroll_salary_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid,
  code text not null,
  label text not null,
  kind text not null,
  taxable boolean not null default true,
  pensionable boolean not null default true,
  insurable boolean not null default true,
  qpip_insurable boolean not null default true,
  amount_annual numeric,
  amount_period numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_salary_components_kind_check check (kind in ('earning','deduction','employer_levy'))
);

create table if not exists public.payroll_tax_constants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  year integer not null,
  jurisdiction text not null default 'CA',
  constants jsonb not null,
  source text,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (year, jurisdiction, effective_from)
);

create table if not exists public.sales_tax_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  province text,
  tax_code text not null,
  rate numeric not null,
  amount numeric not null,
  recoverable_kind text not null default 'none',
  recoverable_amount numeric not null default 0,
  collected_account text,
  recoverable_account text,
  created_at timestamptz not null default now(),
  constraint sales_tax_lines_source_type_check check (source_type in ('invoice','expense','employee_expense')),
  constraint sales_tax_lines_tax_code_check check (tax_code in ('GST','HST','PST','QST')),
  constraint sales_tax_lines_recoverable_kind_check check (recoverable_kind in ('itc','itr','none'))
);

create table if not exists public.project_week_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete cascade,
  week_start date not null,
  hours numeric(6,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  constraint project_week_plans_hours_check check (hours >= 0)
);
