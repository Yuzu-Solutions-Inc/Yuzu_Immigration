import type { ContractEnvelopeSummary } from "@/lib/contracts/types";

export type BookingListItem = {
  id: string;
  personId: string | null;
  serviceId: string;
  hostUserId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  guestName: string;
  guestEmail: string;
  serviceTitle: string;
  hostName: string;
  meetJoinUrl: string | null;
  paymentStatus: string | null;
  paymentAmountCents: number | null;
  paymentCurrency: string | null;
  payUrl: string | null;
  contracts: ContractEnvelopeSummary[];
};

export const BOOKING_LIST_STATUSES = [
  "confirmed",
  "pending_payment",
  "cancelled",
  "completed",
  "no_show",
] as const;

export const BOOKING_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const;

export type BookingListStatus = (typeof BOOKING_LIST_STATUSES)[number];
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];
export type BookingTimeFilter = "all" | "upcoming" | "past" | "today";
export type BookingPaymentFilter = "all" | "none" | BookingPaymentStatus;

export function parseBookingPaymentFilter(
  value: string | undefined,
): BookingPaymentFilter {
  if (value === "all" || value === "none") return value;
  if (value && (BOOKING_PAYMENT_STATUSES as readonly string[]).includes(value)) {
    return value as BookingPaymentFilter;
  }
  return "all";
}

export type BookingListSortKey =
  | "starts_at"
  | "guest"
  | "service"
  | "host"
  | "status"
  | "payment";

export type BookingsListFilters = {
  guestQuery?: string;
  time?: BookingTimeFilter;
  serviceId?: string | "all";
  hostUserId?: string | "all";
  status?: BookingListStatus | "all";
  payment?: BookingPaymentFilter;
  sortKey?: BookingListSortKey;
  sortDir?: "asc" | "desc";
  timezone: string;
  locale?: string;
};
