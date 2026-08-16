-- Product defaults: free cancel 10 days out; 10% fee from 2 days before start.

alter table public.square_connections
  alter column cancel_free_days_before set default 10,
  alter column cancel_min_days_before set default 2,
  alter column cancel_refund_fee_type set default 'percent',
  alter column cancel_refund_fee_percent set default 10;

-- Apply to connections that still have the unused original defaults.
update public.square_connections
set
  cancel_free_days_before = 10,
  cancel_min_days_before = 2,
  cancel_refund_fee_type = 'percent',
  cancel_refund_fee_percent = 10
where cancel_free_days_before = 0
  and cancel_min_days_before = 0
  and cancel_refund_fee_type = 'none'
  and cancel_refund_fee_cents = 0
  and cancel_refund_fee_percent = 0;
