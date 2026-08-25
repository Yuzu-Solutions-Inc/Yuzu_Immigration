-- Project contracts: track when the linked intake form was completed in the portal.

alter table public.project_contracts
  add column if not exists form_submitted_at timestamptz;

comment on column public.project_contracts.form_submitted_at is
  'When the principal completed the linked intake form in the portal, before signing.';
