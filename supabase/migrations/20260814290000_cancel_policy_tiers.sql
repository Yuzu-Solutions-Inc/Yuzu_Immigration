-- Tiered cancellation: free window (cancel_free_days_before) and fee floor (cancel_min_days_before).

alter table public.square_connections
  add column if not exists cancel_free_days_before integer not null default 0;

alter table public.square_connections
  drop constraint if exists square_connections_cancel_free_days_chk;

alter table public.square_connections
  add constraint square_connections_cancel_free_days_chk
    check (cancel_free_days_before >= 0 and cancel_free_days_before <= 365);

-- No-fee policies: preserve minimum cancel notice from existing min_days.
update public.square_connections
set cancel_free_days_before = cancel_min_days_before
where cancel_refund_fee_type = 'none'
  and cancel_min_days_before > 0;

comment on column public.square_connections.cancel_free_days_before is
  'Full refund when the guest cancels at least this many days before start. With a fee tier, cancellations between fee floor and this threshold incur the fee.';
comment on column public.square_connections.cancel_min_days_before is
  'Earliest cancellation allowed: appointment must be at least this many days away. Between this and cancel_free_days_before, a refund fee applies when configured.';
