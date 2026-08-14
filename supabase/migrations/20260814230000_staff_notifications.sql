-- In-app notifications for consultants (document uploads, form completion, IRCC form cert).

create table public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.immigration_projects(id) on delete cascade,
  kind text not null
    check (kind in ('documents_uploaded', 'forms_complete', 'form_certification')),
  title text not null,
  body text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.staff_notifications is
  'Per-user in-app notifications for firm staff. Created by server paths; users mark read.';

create index staff_notifications_user_created_idx
  on public.staff_notifications (user_id, created_at desc);

create index staff_notifications_user_unread_idx
  on public.staff_notifications (user_id, created_at desc)
  where read_at is null;

create index staff_notifications_org_kind_idx
  on public.staff_notifications (organization_id, kind, created_at desc);

create index staff_notifications_project_id_idx
  on public.staff_notifications (project_id)
  where project_id is not null;

alter table public.staff_notifications enable row level security;

create policy staff_notifications_select_own
  on public.staff_notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_org_member(organization_id)
  );

create policy staff_notifications_update_own
  on public.staff_notifications for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_org_member(organization_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.is_org_member(organization_id)
  );

create policy staff_notifications_delete_own
  on public.staff_notifications for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_org_member(organization_id)
  );

-- Inserts are service_role only (emit from trusted server paths).
grant select, update, delete on public.staff_notifications to authenticated;
grant select, insert, update, delete on public.staff_notifications to service_role;
