-- Per-org data-encryption keys, stored wrapped. The plaintext DEK never
-- lives in Postgres. Unwrap uses DOCUMENT_ENCRYPTION_KEY in the app.

alter table public.organizations
  add column if not exists wrapped_dek text;

comment on column public.organizations.wrapped_dek is
  'Org data-encryption key wrapped with DOCUMENT_ENCRYPTION_KEY. Plaintext DEK never stored.';

create or replace function public.protect_wrapped_dek()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.wrapped_dek is distinct from old.wrapped_dek
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.wrapped_dek := old.wrapped_dek;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_wrapped_dek on public.organizations;
create trigger organizations_protect_wrapped_dek
  before update on public.organizations
  for each row
  execute function public.protect_wrapped_dek();
