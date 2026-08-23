import "server-only";

import {
  addDaysToIsoDate,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";
import type {
  BookingListItem,
  BookingListSortKey,
  BookingPaymentFilter,
  BookingTimeFilter,
  BookingsListFilters,
} from "@/lib/booking/bookings-list-shared";
import { listContractSummariesForAppointments } from "@/lib/contracts/queries";
import type { ContractEnvelopeSummary } from "@/lib/contracts/types";
import {
  LIST_IN_FILTER_CAP,
  asListFilterQuery,
  clampListLimit,
  clampListOffset,
  emptyListPage,
  fetchAllInChunks,
  listRange,
  type ListFilterQuery,
  type ListPage,
} from "@/lib/lists/pagination";
import {
  hashEmailLookup,
  looksLikeEmail,
  matchesSearchQuery,
} from "@/lib/security/email-lookup";
import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { decryptPaymentToken } from "@/lib/square/payments";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { serviceTitle } from "@/lib/booking/service-i18n";

export {
  BOOKING_LIST_STATUSES,
  BOOKING_PAYMENT_STATUSES,
  parseBookingPaymentFilter,
} from "@/lib/booking/bookings-list-shared";
export type {
  BookingListItem,
  BookingListSortKey,
  BookingListStatus,
  BookingPaymentFilter,
  BookingPaymentStatus,
  BookingTimeFilter,
  BookingsListFilters,
} from "@/lib/booking/bookings-list-shared";

const BOOKING_LIST_SELECT =
  "id, person_id, starts_at, ends_at, status, guest_name, guest_email, host_user_id, service_id, meet_join_url, service:booking_services(title, translations)";

type BookingListDbRow = {
  id: string;
  person_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  guest_name: string;
  guest_email: string;
  host_user_id: string;
  service_id: string;
  meet_join_url: string | null;
  service:
    | { title?: string; translations?: unknown }
    | { title?: string; translations?: unknown }[]
    | null;
};

type PaymentListRow = {
  appointment_id: string;
  status: string;
  amount_cents: number | null;
  currency: string | null;
  token_encrypted: string | null;
  checkout_url: string | null;
};

function applyBookingTimeFilter(
  query: ListFilterQuery,
  time: BookingTimeFilter,
  timezone: string,
) {
  if (time === "all") return query;
  const now = new Date();
  if (time === "past") {
    return query.lt("starts_at", now.toISOString());
  }
  const todayIso = zonedDateIso(now, timezone);
  const startOfToday = zonedCivilToUtc(todayIso, "00:00", timezone).toISOString();
  if (time === "upcoming") {
    return query.gte("starts_at", startOfToday);
  }
  const startOfTomorrow = zonedCivilToUtc(
    addDaysToIsoDate(todayIso, 1),
    "00:00",
    timezone,
  ).toISOString();
  return query.gte("starts_at", startOfToday).lt("starts_at", startOfTomorrow);
}

function applyBookingSqlFilters(
  query: ListFilterQuery,
  filters: BookingsListFilters,
) {
  const serviceId = filters.serviceId ?? "all";
  const hostUserId = filters.hostUserId ?? "all";
  const status = filters.status ?? "all";
  query = applyBookingTimeFilter(query, filters.time ?? "upcoming", filters.timezone);
  if (serviceId !== "all") query = query.eq("service_id", serviceId);
  if (hostUserId !== "all") query = query.eq("host_user_id", hostUserId);
  if (status !== "all") query = query.eq("status", status);
  return query;
}

function bookingsNeedsDecryptScan(filters: BookingsListFilters) {
  const guestQuery = filters.guestQuery?.trim() ?? "";
  const sortKey = filters.sortKey ?? "starts_at";
  if (guestQuery && !looksLikeEmail(guestQuery)) return true;
  return sortKey !== "starts_at";
}

async function fetchBookingRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  filters: BookingsListFilters,
  extra?: (query: ListFilterQuery) => ListFilterQuery,
): Promise<{ rows: BookingListDbRow[]; error: string | null }> {
  return fetchAllInChunks<BookingListDbRow>(async (from, to) => {
    let query = asListFilterQuery(
      supabase
        .from("booking_appointments")
        .select(BOOKING_LIST_SELECT)
        .eq("organization_id", organizationId),
    );
    query = applyBookingSqlFilters(query, filters);
    if (extra) query = extra(query);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, to);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as BookingListDbRow[], error: null };
  });
}

async function loadPaymentsByAppointment(
  organizationId: string,
  appointmentIds: string[],
) {
  const map = new Map<string, PaymentListRow>();
  if (appointmentIds.length === 0) return map;
  const admin = createServiceClient();
  for (let i = 0; i < appointmentIds.length; i += LIST_IN_FILTER_CAP) {
    const chunk = appointmentIds.slice(i, i + LIST_IN_FILTER_CAP);
    const { data } = await admin
      .from("payment_requests")
      .select(
        "appointment_id, status, amount_cents, currency, token_encrypted, checkout_url",
      )
      .eq("organization_id", organizationId)
      .eq("source", "booking")
      .in("appointment_id", chunk);
    for (const row of (data ?? []) as PaymentListRow[]) {
      map.set(row.appointment_id, row);
    }
  }
  return map;
}

async function paymentAppointmentFilter(
  organizationId: string,
  payment: BookingPaymentFilter,
): Promise<{ mode: "none" } | { mode: "in" | "not_in"; ids: string[] }> {
  if (payment === "all") return { mode: "none" };
  const admin = createServiceClient();
  const { rows, error } = await fetchAllInChunks<{
    appointment_id: string;
    status: string;
  }>(async (from, to) => {
    const { data, error: pageError } = await admin
      .from("payment_requests")
      .select("appointment_id, status")
      .eq("organization_id", organizationId)
      .eq("source", "booking")
      .order("id", { ascending: true })
      .range(from, to);
    if (pageError) return { rows: [], error: pageError.message };
    return {
      rows: (data ?? []) as { appointment_id: string; status: string }[],
      error: null,
    };
  });
  if (error) {
    console.error("paymentAppointmentFilter:", error);
    return { mode: "in", ids: [] };
  }
  if (payment === "none") {
    return {
      mode: "not_in",
      ids: [...new Set(rows.map((row) => row.appointment_id))],
    };
  }
  return {
    mode: "in",
    ids: [
      ...new Set(
        rows
          .filter((row) => row.status === payment)
          .map((row) => row.appointment_id),
      ),
    ],
  };
}

function applyIdFilter(
  query: ListFilterQuery,
  paymentFilter: { mode: "none" } | { mode: "in" | "not_in"; ids: string[] },
): ListFilterQuery | null | "scan" {
  if (paymentFilter.mode === "none") return query;
  if (paymentFilter.mode === "in") {
    if (paymentFilter.ids.length === 0) return null;
    return query.in("id", paymentFilter.ids);
  }
  if (paymentFilter.ids.length === 0) return query;
  if (paymentFilter.ids.length > LIST_IN_FILTER_CAP) return "scan";
  return query.not("id", "in", `(${paymentFilter.ids.join(",")})`);
}

async function hydrateBookingItems(
  organizationId: string,
  rows: BookingListDbRow[],
  locale: string,
  dek: Buffer,
  paymentByAppointment: Map<string, PaymentListRow>,
): Promise<BookingListItem[]> {
  if (rows.length === 0) return [];
  const appointmentIds = rows.map((row) => row.id);
  const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
  const admin = createServiceClient();
  const [{ data: profiles }, origin, contracts] = await Promise.all([
    hostIds.length > 0
      ? admin.from("profiles").select("id, full_name, email").in("id", hostIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    import("@/lib/app-url").then((mod) => mod.getAppBaseUrl()),
    listContractSummariesForAppointments(organizationId, appointmentIds),
  ]);
  const hostName = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null)?.trim() ||
        (row.email as string | null) ||
        row.id,
    ]),
  );
  const contractsByAppointment = new Map<string, ContractEnvelopeSummary[]>();
  for (const row of contracts) {
    const list = contractsByAppointment.get(row.appointment_id) ?? [];
    list.push(row);
    contractsByAppointment.set(row.appointment_id, list);
  }

  return rows.map((row) => {
    const guest = decryptBookingGuestRow(
      {
        guest_name: row.guest_name,
        guest_email: row.guest_email,
      },
      dek,
    );
    const serviceRow = Array.isArray(row.service) ? row.service[0] : row.service;
    const payment = paymentByAppointment.get(row.id);
    const token = payment
      ? decryptPaymentToken(payment.token_encrypted, dek)
      : null;
    const payUrl =
      payment?.status === "pending" && token
        ? `${origin.replace(/\/$/, "")}/${locale}/pay/${token}`
        : payment?.status === "pending" && payment.checkout_url
          ? payment.checkout_url
          : null;

    return {
      id: row.id,
      personId: row.person_id,
      serviceId: row.service_id,
      hostUserId: row.host_user_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      guestName: guest.guest_name,
      guestEmail: guest.guest_email,
      serviceTitle: serviceTitle(serviceRow, locale),
      hostName: hostName.get(row.host_user_id) ?? "—",
      meetJoinUrl: row.meet_join_url,
      paymentStatus: payment?.status ?? null,
      paymentAmountCents: payment?.amount_cents ?? null,
      paymentCurrency: payment?.currency ?? null,
      payUrl,
      contracts: contractsByAppointment.get(row.id) ?? [],
    };
  });
}

function sortBookingItems<
  T extends Pick<
    BookingListItem,
    | "startsAt"
    | "guestName"
    | "serviceTitle"
    | "hostName"
    | "status"
    | "paymentStatus"
  >,
>(rows: T[], sortKey: BookingListSortKey, sortDir: "asc" | "desc"): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey === "starts_at") cmp = a.startsAt.localeCompare(b.startsAt);
    else if (sortKey === "guest") {
      cmp = a.guestName.localeCompare(b.guestName, undefined, {
        sensitivity: "base",
      });
    } else if (sortKey === "service") {
      cmp = a.serviceTitle.localeCompare(b.serviceTitle, undefined, {
        sensitivity: "base",
      });
    } else if (sortKey === "host") {
      cmp = a.hostName.localeCompare(b.hostName, undefined, {
        sensitivity: "base",
      });
    } else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    else {
      cmp = (a.paymentStatus ?? "").localeCompare(b.paymentStatus ?? "");
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export async function countOrgBookings(organizationId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("booking_appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) {
    console.error("countOrgBookings:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function listOrgBookingsPage(
  organizationId: string,
  filters: BookingsListFilters,
  page: { offset?: number; limit?: number } = {},
): Promise<ListPage<BookingListItem>> {
  const supabase = await createClient();
  const dek = await getOrgDataKey(organizationId);
  const offset = clampListOffset(page.offset);
  const limit = clampListLimit(page.limit);
  const locale = filters.locale ?? "en";
  const guestQuery = filters.guestQuery?.trim() ?? "";
  const sortKey = filters.sortKey ?? "starts_at";
  const sortDir = filters.sortDir ?? "asc";
  const payment = filters.payment ?? "all";

  let extra: ((query: ListFilterQuery) => ListFilterQuery) | undefined;
  if (guestQuery && looksLikeEmail(guestQuery)) {
    extra = (query) =>
      query.eq(
        "email_lookup_hash",
        hashEmailLookup(organizationId, guestQuery, dek),
      );
  }

  const paymentFilter = await paymentAppointmentFilter(organizationId, payment);
  if (paymentFilter.mode === "in" && paymentFilter.ids.length === 0) {
    return emptyListPage();
  }
  const canSqlPaginate =
    !bookingsNeedsDecryptScan(filters) &&
    (paymentFilter.mode === "none" ||
      paymentFilter.ids.length <= LIST_IN_FILTER_CAP);

  if (canSqlPaginate) {
    const { from, to } = listRange(offset, limit);
    let query = asListFilterQuery(
      supabase
        .from("booking_appointments")
        .select(BOOKING_LIST_SELECT, { count: "exact" })
        .eq("organization_id", organizationId),
    );
    query = applyBookingSqlFilters(query, filters);
    if (extra) query = extra(query);
    const withIds = applyIdFilter(query, paymentFilter);
    if (withIds === null || withIds === "scan") return emptyListPage();
    query = withIds
      .order("starts_at", { ascending: sortDir === "asc" })
      .order("id", { ascending: sortDir === "asc" });
    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("listOrgBookingsPage:", error.message);
      return emptyListPage();
    }
    const rows = (data ?? []) as BookingListDbRow[];
    const payments = await loadPaymentsByAppointment(
      organizationId,
      rows.map((row) => row.id),
    );
    return {
      items: await hydrateBookingItems(
        organizationId,
        rows,
        locale,
        dek,
        payments,
      ),
      total: count ?? 0,
    };
  }

  const { rows, error } = await fetchBookingRows(
    supabase,
    organizationId,
    filters,
    extra,
  );
  if (error) {
    console.error("listOrgBookingsPage:", error);
    return emptyListPage();
  }

  const needGuest =
    Boolean(guestQuery && !looksLikeEmail(guestQuery)) || sortKey === "guest";
  const needAllPayments = payment !== "all" || sortKey === "payment";
  const appointmentIds = rows.map((row) => row.id);
  const payments = needAllPayments
    ? await loadPaymentsByAppointment(organizationId, appointmentIds)
    : new Map<string, PaymentListRow>();

  const hostName = new Map<string, string>();
  if (sortKey === "host") {
    const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
    const admin = createServiceClient();
    for (let i = 0; i < hostIds.length; i += LIST_IN_FILTER_CAP) {
      const chunk = hostIds.slice(i, i + LIST_IN_FILTER_CAP);
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", chunk);
      for (const profile of profiles ?? []) {
        hostName.set(
          profile.id as string,
          (profile.full_name as string | null)?.trim() ||
            (profile.email as string | null) ||
            (profile.id as string),
        );
      }
    }
  }

  const matched = sortBookingItems(
    rows
      .map((row) => {
        const guest = needGuest
          ? decryptBookingGuestRow(
              {
                guest_name: row.guest_name,
                guest_email: row.guest_email,
              },
              dek,
            )
          : { guest_name: "", guest_email: "" };
        const serviceRow = Array.isArray(row.service)
          ? row.service[0]
          : row.service;
        return {
          row,
          startsAt: row.starts_at,
          guestName: guest.guest_name,
          guestEmail: guest.guest_email,
          serviceTitle: serviceTitle(serviceRow, locale),
          hostName: hostName.get(row.host_user_id) ?? "",
          status: row.status,
          paymentStatus: payments.get(row.id)?.status ?? null,
        };
      })
      .filter((booking) => {
        if (guestQuery && !looksLikeEmail(guestQuery)) {
          if (
            !matchesSearchQuery(
              `${booking.guestName} ${booking.guestEmail}`,
              guestQuery,
            )
          ) {
            return false;
          }
        }
        if (payment === "none") return !booking.paymentStatus;
        if (payment !== "all") return booking.paymentStatus === payment;
        return true;
      }),
    sortKey,
    sortDir,
  );
  const pageRows = matched.slice(offset, offset + limit).map((item) => item.row);
  const pagePayments = needAllPayments
    ? new Map(
        pageRows.flatMap((row) => {
          const paymentRow = payments.get(row.id);
          return paymentRow ? [[row.id, paymentRow] as const] : [];
        }),
      )
    : await loadPaymentsByAppointment(
        organizationId,
        pageRows.map((row) => row.id),
      );
  return {
    items: await hydrateBookingItems(
      organizationId,
      pageRows,
      locale,
      dek,
      pagePayments,
    ),
    total: matched.length,
  };
}

export async function listOrgBookingsWithPayment(
  organizationId: string,
  options?: { limit?: number; locale?: string; timezone?: string },
): Promise<BookingListItem[]> {
  const page = await listOrgBookingsPage(
    organizationId,
    {
      time: "all",
      timezone: options?.timezone ?? "America/Toronto",
      locale: options?.locale ?? "en",
      sortKey: "starts_at",
      sortDir: "desc",
    },
    { offset: 0, limit: options?.limit ?? 200 },
  );
  return page.items;
}
