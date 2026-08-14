alter table public.booking_service_email_automations
  add column if not exists include_do_not_reply boolean not null default true;

comment on column public.booking_service_email_automations.include_do_not_reply is
  'When true, reminder emails include an automated do-not-reply notice.';
