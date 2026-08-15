-- Track Square refunds on payment_requests when paid bookings are cancelled.

alter type public.payment_status add value if not exists 'refunded';

alter table public.payment_requests
  add column if not exists square_refund_id text,
  add column if not exists refunded_at timestamptz;

comment on column public.payment_requests.square_refund_id is
  'Square PaymentRefund id after a full refund (e.g. cancelled paid booking).';

comment on column public.payment_requests.refunded_at is
  'When the payment was marked refunded in Yuzu.';
