-- Per-consultant saved signature used to pre-sign service contracts.

create table public.staff_contract_signatures (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  presign_all boolean not null default false,
  signature_kind public.contract_signature_kind,
  signature_text text,
  signature_image text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

comment on table public.staff_contract_signatures is
  'Consultant e-sign mark (typed or PNG). When presign_all is on, new booking contracts are countersigned automatically.';

alter table public.staff_contract_signatures enable row level security;

create policy staff_contract_signatures_select
  on public.staff_contract_signatures for select to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy staff_contract_signatures_insert
  on public.staff_contract_signatures for insert to authenticated
  with check (
    public.is_org_full_access(organization_id)
    and user_id = auth.uid()
  );

create policy staff_contract_signatures_update
  on public.staff_contract_signatures for update to authenticated
  using (
    public.is_org_full_access(organization_id)
    and user_id = auth.uid()
  )
  with check (
    public.is_org_full_access(organization_id)
    and user_id = auth.uid()
  );

create policy staff_contract_signatures_delete
  on public.staff_contract_signatures for delete to authenticated
  using (
    public.is_org_full_access(organization_id)
    and user_id = auth.uid()
  );

grant select, insert, update, delete on public.staff_contract_signatures to authenticated;
grant select, insert, update, delete on public.staff_contract_signatures to service_role;
