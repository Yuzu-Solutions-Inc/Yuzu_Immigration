-- Per-language title and description for bookable services.

alter table public.booking_services
  add column if not exists translations jsonb not null default '{}'::jsonb;

comment on column public.booking_services.translations is
  'Optional en/fr/es copies: { "fr": { "title": "...", "description": "..." } }. title/description columns remain the fallback.';
