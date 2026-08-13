-- Encrypted share token so staff can recopy a still-valid client link.
-- Public fill lookup stays on token_hash.

alter table public.form_share_links
  add column if not exists token_encrypted text;

comment on column public.form_share_links.token_encrypted is
  'Org-DEK encrypted share token for staff recopy. Null on links created before this column.';
