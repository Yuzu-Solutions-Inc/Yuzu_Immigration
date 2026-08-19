-- Per-locale HTML for service contract templates (same fallback as reminder emails).

alter table public.contract_templates
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.contract_templates
  drop constraint if exists contract_templates_translations_chk;

alter table public.contract_templates
  add constraint contract_templates_translations_chk
  check (jsonb_typeof(translations) = 'object');

comment on column public.contract_templates.translations is
  'Per-locale document HTML keyed by app locale (en, fr, es). Missing locales fall back to the firm default language, then body_html.';

update public.contract_templates t
set translations = jsonb_build_object(o.default_locale, t.body_html)
from public.organizations o
where t.organization_id = o.id
  and t.translations = '{}'::jsonb
  and char_length(trim(t.body_html)) > 0;
