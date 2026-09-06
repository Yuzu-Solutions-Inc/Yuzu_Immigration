-- Sales tax is calculated once on the invoice HT subtotal (CRA / Revenu Québec
-- invoice-total method), then rounded to the cent. Line items are tax-exclusive.
-- gst/qst/total on invoice_line_items invited a competing per-line tax model.

alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_gst_check,
  drop constraint if exists invoice_line_items_qst_check,
  drop constraint if exists invoice_line_items_total_check;

alter table public.invoice_line_items
  drop column if exists gst,
  drop column if exists qst,
  drop column if exists total;

comment on column public.invoices.gst is
  'GST or HST collected. Rounded once on invoices.subtotal, never summed from line items.';
comment on column public.invoices.qst is
  'QST collected. Rounded once on invoices.subtotal. Zero outside Québec.';
comment on column public.invoices.subtotal is
  'Sum of tax-exclusive line amounts. Place-of-supply tax is applied to this total.';
comment on column public.invoice_line_items.subtotal is
  'Tax-exclusive line amount. Do not store per-line GST/HST/QST.';
