-- Partners are the CRM contact. Immigration-only fields stay null when that module is off.
alter table public.partners
  add column if not exists immigration_status text,
  add column if not exists status_expires_at date,
  add column if not exists preferred_locale text not null default 'fr';

comment on column public.partners.immigration_status is
  'Canadian immigration status; used only when the immigration module is on.';

-- Member is the staff role (legacy case_manager mapped here).
update public.organization_members
  set role = 'member'
  where role = 'case_manager';

update public.organization_invitations
  set role = 'member'
  where role = 'case_manager';

-- organization_modules is the only product-on switch. Drop bookings/services
-- checkboxes that have no tables on this database.
delete from public.organization_modules
where module_id in ('bookings', 'services', 'contracts', 'payments');
