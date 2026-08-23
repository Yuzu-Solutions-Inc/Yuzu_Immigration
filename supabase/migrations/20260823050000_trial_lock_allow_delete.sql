-- After trial expiry, authenticated staff may DELETE org-scoped rows
-- (clients, projects, documents). INSERT/UPDATE stay blocked.
-- The organization row itself remains non-deletable and non-updatable.

do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = 'organization_id'
      and c.relname <> 'staff_notifications'
  loop
    execute format(
      'drop trigger if exists trg_trial_lock on public.%I',
      r.table_name
    );
    execute format(
      'create trigger trg_trial_lock
         before insert or update on public.%I
         for each row execute function public.reject_writes_when_trial_expired()',
      r.table_name
    );
  end loop;

  drop trigger if exists trg_trial_lock on public.organizations;
  create trigger trg_trial_lock
    before update or delete on public.organizations
    for each row execute function public.reject_writes_when_trial_expired();
end;
$$;
