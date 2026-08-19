import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { decryptPaymentToken } from "@/lib/square/payments";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { listContractSummariesForAppointments } from "@/lib/contracts/queries";
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

export async function listOrgBookingsWithPayment(
  organizationId: string,
  options?: { limit?: number; locale?: string },
): Promise<BookingListItem[]> {
  const supabase = await createClient();
  const limit = options?.limit ?? 200;
  const locale = options?.locale ?? "en";

  const { data, error } = await supabase
    .from("booking_appointments")
    .select(
      "id, person_id, starts_at, ends_at, status, guest_name, guest_email, host_user_id, service_id, meet_join_url, service:booking_services(title, translations)",
    )
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listOrgBookingsWithPayment:", error.message);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const appointmentIds = rows.map((row) => row.id as string);
  const hostIds = [...new Set(rows.map((row) => row.host_user_id as string))];

  const admin = createServiceClient();
  const [{ data: payments }, { data: profiles }] = await Promise.all([
    admin
      .from("payment_requests")
      .select(
        "appointment_id, status, amount_cents, currency, token_encrypted, checkout_url",
      )
      .eq("organization_id", organizationId)
      .eq("source", "booking")
      .in("appointment_id", appointmentIds),
    admin.from("profiles").select("id, full_name, email").in("id", hostIds),
  ]);

  const paymentByAppointment = new Map(
    (payments ?? []).map((row) => [row.appointment_id as string, row]),
  );
  const hostName = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null)?.trim() ||
        (row.email as string | null) ||
        row.id,
    ]),
  );

  const dek = await getOrgDataKey(organizationId);
  const { getAppBaseUrl } = await import("@/lib/app-url");
  const origin = await getAppBaseUrl();
  const contracts = await listContractSummariesForAppointments(
    organizationId,
    appointmentIds,
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
        guest_name: row.guest_name as string,
        guest_email: row.guest_email as string,
      },
      dek,
    );
    const service = row.service as
      | { title?: string; translations?: unknown }
      | { title?: string; translations?: unknown }[]
      | null;
    const serviceRow = Array.isArray(service) ? service[0] : service;
    const resolvedTitle = serviceTitle(serviceRow, locale);
    const payment = paymentByAppointment.get(row.id as string);
    const token = payment
      ? decryptPaymentToken(payment.token_encrypted as string | null, dek)
      : null;
    const payUrl =
      payment?.status === "pending" && token
        ? `${origin.replace(/\/$/, "")}/${locale}/pay/${token}`
        : payment?.status === "pending" && payment.checkout_url
          ? (payment.checkout_url as string)
          : null;

    return {
      id: row.id as string,
      personId: (row.person_id as string | null) ?? null,
      serviceId: row.service_id as string,
      hostUserId: row.host_user_id as string,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
      status: row.status as string,
      guestName: guest.guest_name,
      guestEmail: guest.guest_email,
      serviceTitle: resolvedTitle,
      hostName: hostName.get(row.host_user_id as string) ?? "—",
      meetJoinUrl: (row.meet_join_url as string | null) ?? null,
      paymentStatus: (payment?.status as string | null) ?? null,
      paymentAmountCents: (payment?.amount_cents as number | null) ?? null,
      paymentCurrency: (payment?.currency as string | null) ?? null,
      payUrl,
      contracts: contractsByAppointment.get(row.id as string) ?? [],
    };
  });
}
