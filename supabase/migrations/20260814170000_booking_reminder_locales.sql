-- Firm default language, guest preferred language on bookings, and
-- per-locale reminder copy for automated emails.

alter table public.organizations
  add column if not exists default_locale text not null default 'en';

alter table public.organizations
  drop constraint if exists organizations_default_locale_chk;

alter table public.organizations
  add constraint organizations_default_locale_chk
  check (default_locale in ('en', 'fr', 'es'));

comment on column public.organizations.default_locale is
  'Default firm language. Used when a client preferred language has no reminder copy.';

alter table public.booking_appointments
  add column if not exists guest_preferred_locale text;

alter table public.booking_appointments
  drop constraint if exists booking_appointments_guest_preferred_locale_chk;

alter table public.booking_appointments
  add constraint booking_appointments_guest_preferred_locale_chk
  check (
    guest_preferred_locale is null
    or guest_preferred_locale in ('en', 'fr', 'es')
  );

comment on column public.booking_appointments.guest_preferred_locale is
  'Language chosen on the public booking form. Drives reminder email language.';

alter table public.booking_service_email_automations
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.booking_service_email_automations
  drop constraint if exists booking_service_email_automations_translations_chk;

alter table public.booking_service_email_automations
  add constraint booking_service_email_automations_translations_chk
  check (jsonb_typeof(translations) = 'object');

comment on column public.booking_service_email_automations.translations is
  'Per-locale subject/body keyed by app locale (en, fr, es). Missing locales fall back to the firm default language, then subject/body.';

update public.booking_service_email_automations
set translations = jsonb_build_object(
  'en', jsonb_build_object('subject', subject, 'body', body)
)
where translations = '{}'::jsonb
  and char_length(trim(subject)) > 0
  and char_length(trim(body)) > 0;
