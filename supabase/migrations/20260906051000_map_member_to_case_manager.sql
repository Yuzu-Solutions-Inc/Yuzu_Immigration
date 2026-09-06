alter table public.organization_invitations drop constraint if exists organization_invitations_role_check;
alter table public.organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('admin', 'member', 'case_manager'));

update public.organization_members
set role = 'case_manager'
where role::text = 'member';
