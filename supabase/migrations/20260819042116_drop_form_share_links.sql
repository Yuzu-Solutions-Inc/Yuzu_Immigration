-- Remove client share-link intake. The client portal is the only client path.

drop function if exists public.form_share_link_password_exists(text);
drop function if exists public.client_set_form_share_link_password(text, text);
drop function if exists public.verify_form_share_link_password(text, text);

drop table if exists private.form_share_link_secrets;
drop table if exists public.share_link_auth_events;
drop table if exists public.form_share_links;

alter table public.project_document_files
  drop constraint if exists project_document_files_uploaded_via_check;

update public.project_document_files
set uploaded_via = 'portal'
where uploaded_via = 'share_link';

alter table public.project_document_files
  alter column uploaded_via set default 'portal';

alter table public.project_document_files
  add constraint project_document_files_uploaded_via_check
  check (uploaded_via in ('portal', 'staff'));

update public.security_audit_events
set actor_kind = 'portal'
where actor_kind = 'share_link';

alter table public.security_audit_events
  drop constraint if exists security_audit_events_actor_kind_check;

alter table public.security_audit_events
  add constraint security_audit_events_actor_kind_check
  check (
    actor_kind = any (
      array[
        'staff'::text,
        'public_booking'::text,
        'portal'::text,
        'system'::text,
        'service'::text
      ]
    )
  );
