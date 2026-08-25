-- The licensed-write trigger is attached to every public table with
-- organization_id. Referencing NEW.user_id compiles against the firing
-- table's row type, so inserts/updates/deletes on tables without user_id
-- (services, people, projects, …) failed with:
--   record "new" has no field "user_id"

create or replace function public.reject_unlicensed_org_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_organization_id uuid;
  v_new_user_id uuid;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
  else
    v_organization_id := new.organization_id;
  end if;

  -- First owner membership insert happens before is_org_licensed() is true.
  -- Read user_id via jsonb so this function is safe on tables without that column.
  if tg_table_name = 'organization_members' and tg_op = 'INSERT' then
    v_new_user_id := (pg_catalog.to_jsonb(new) ->> 'user_id')::uuid;
    if v_new_user_id = (select auth.uid())
      and not exists (
        select 1
        from public.organization_members m
        where m.organization_id = v_organization_id
      )
    then
      return new;
    end if;
  end if;

  if not public.is_org_licensed(v_organization_id) then
    raise exception 'unlicensed_read_only' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;
