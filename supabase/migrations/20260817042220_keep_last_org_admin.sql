-- Keep at least one org admin. Deleting or demoting the last admin is blocked
-- at RLS so the Data API cannot orphan a firm.

create or replace function public.org_has_other_admin(
  p_organization_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.role = 'admin'::public.org_member_role
      and m.user_id is distinct from p_user_id
  );
$function$;

comment on function public.org_has_other_admin(uuid, uuid) is
  'True when the organization has an admin other than p_user_id. Used to keep a last admin.';

revoke all on function public.org_has_other_admin(uuid, uuid) from public, anon;
grant execute on function public.org_has_other_admin(uuid, uuid) to authenticated, service_role;

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin
  on public.organization_members for delete to authenticated
  using (
    public.is_org_admin(organization_id)
    and (
      role <> 'admin'::public.org_member_role
      or public.org_has_other_admin(organization_id, user_id)
    )
  );

drop policy if exists organization_members_update_admin on public.organization_members;
create policy organization_members_update_admin
  on public.organization_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (
    public.is_org_admin(organization_id)
    and (
      role = 'admin'::public.org_member_role
      or public.org_has_other_admin(organization_id, user_id)
    )
  );
