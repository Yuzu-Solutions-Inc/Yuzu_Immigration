-- Cancellation / refund policy on Square connections (per firm).

alter table public.square_connections
  add column if not exists cancel_refund_enabled boolean not null default true,
  add column if not exists cancel_min_days_before integer not null default 0,
  add column if not exists cancel_refund_fee_type text not null default 'none',
  add column if not exists cancel_refund_fee_cents integer not null default 0,
  add column if not exists cancel_refund_fee_percent integer not null default 0;

alter table public.square_connections
  drop constraint if exists square_connections_cancel_min_days_chk,
  drop constraint if exists square_connections_cancel_fee_type_chk,
  drop constraint if exists square_connections_cancel_fee_cents_chk,
  drop constraint if exists square_connections_cancel_fee_percent_chk;

alter table public.square_connections
  add constraint square_connections_cancel_min_days_chk
    check (cancel_min_days_before >= 0 and cancel_min_days_before <= 365),
  add constraint square_connections_cancel_fee_type_chk
    check (cancel_refund_fee_type in ('none', 'fixed', 'percent')),
  add constraint square_connections_cancel_fee_cents_chk
    check (cancel_refund_fee_cents >= 0),
  add constraint square_connections_cancel_fee_percent_chk
    check (cancel_refund_fee_percent >= 0 and cancel_refund_fee_percent <= 100);

comment on column public.square_connections.cancel_refund_enabled is
  'When true, cancelling a paid booking triggers a Square refund (minus any fee).';
comment on column public.square_connections.cancel_min_days_before is
  'Guests may cancel only if the appointment starts at least this many days from now. 0 = until start.';
comment on column public.square_connections.cancel_refund_fee_type is
  'none | fixed (cents) | percent of paid amount retained on cancel refund.';
