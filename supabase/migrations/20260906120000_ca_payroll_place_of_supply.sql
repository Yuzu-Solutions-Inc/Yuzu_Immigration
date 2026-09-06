-- Canadian payroll engine + place-of-supply ledgers.
-- Additive only. Finance core tables were introduced outside this repo's
-- earlier migrations; every statement is guarded.

do $$
begin
  if to_regclass('public.employees') is not null then
    alter table public.employees add column if not exists province_of_employment text not null default 'QC';
    alter table public.employees add column if not exists td1_federal_claim numeric;
    alter table public.employees add column if not exists td1_provincial_claim numeric;
    alter table public.employees add column if not exists pensionable_months integer not null default 12;
    alter table public.employees add column if not exists cpp_qpp_exempt boolean not null default false;
    alter table public.employees add column if not exists qpip_exempt boolean not null default false;
  end if;

  if to_regclass('public.payroll_runs') is not null then
    alter table public.payroll_runs add column if not exists cnt_employer numeric not null default 0;
    alter table public.payroll_runs add column if not exists qpp2_employee numeric not null default 0;
    alter table public.payroll_runs add column if not exists qpp2_employer numeric not null default 0;
    alter table public.payroll_runs add column if not exists engine_year integer;
    alter table public.payroll_runs add column if not exists t4_boxes jsonb not null default '{}'::jsonb;
    alter table public.payroll_runs add column if not exists rl1_boxes jsonb not null default '{}'::jsonb;
  end if;
end $$;

create table if not exists public.payroll_salary_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid,
  code text not null,
  label text not null,
  kind text not null check (kind in ('earning', 'deduction', 'employer_levy')),
  taxable boolean not null default true,
  pensionable boolean not null default true,
  insurable boolean not null default true,
  qpip_insurable boolean not null default true,
  amount_annual numeric,
  amount_period numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  source_type text not null check (source_type in ('invoice', 'expense', 'employee_expense')),
  source_id uuid not null,
  province text,
  tax_code text not null check (tax_code in ('GST', 'HST', 'PST', 'QST')),
  rate numeric not null,
  amount numeric not null,
  recoverable_kind text not null default 'none' check (recoverable_kind in ('itc', 'itr', 'none')),
  recoverable_amount numeric not null default 0,
  collected_account text,
  recoverable_account text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_salary_components_org_idx
  on public.payroll_salary_components (organization_id, employee_id);
create index if not exists sales_tax_lines_org_source_idx
  on public.sales_tax_lines (organization_id, source_type, source_id);

alter table public.payroll_salary_components enable row level security;
alter table public.payroll_tax_constants enable row level security;
alter table public.sales_tax_lines enable row level security;

drop policy if exists payroll_salary_components_member on public.payroll_salary_components;
create policy payroll_salary_components_member on public.payroll_salary_components
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists payroll_tax_constants_member on public.payroll_tax_constants;
create policy payroll_tax_constants_member on public.payroll_tax_constants
  for all to authenticated
  using (organization_id is null or public.is_org_member(organization_id))
  with check (organization_id is null or public.is_org_member(organization_id));

drop policy if exists sales_tax_lines_member on public.sales_tax_lines;
create policy sales_tax_lines_member on public.sales_tax_lines
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update, delete on public.payroll_salary_components to authenticated;
grant select, insert, update, delete on public.payroll_tax_constants to authenticated;
grant select, insert, update, delete on public.sales_tax_lines to authenticated;
