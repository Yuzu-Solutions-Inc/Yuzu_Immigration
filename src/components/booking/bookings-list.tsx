"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Mail,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  cancelAppointmentAction,
  listAppointmentRescheduleSlotsAction,
  rescheduleAppointmentAction,
  type RescheduleSlotOption,
} from "@/app/actions/booking";
import { sendBookingPaymentReminderAction } from "@/app/actions/booking-payment-reminder";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { BookingListItem } from "@/lib/booking/bookings-list";
import { formatPriceCents } from "@/lib/booking/slots";
import {
  formatDateInZone,
  formatTimeInZone,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const BOOKING_STATUSES = [
  "confirmed",
  "pending_payment",
  "cancelled",
  "completed",
  "no_show",
] as const;

const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const;

type BookingStatus = (typeof BOOKING_STATUSES)[number];
type PaymentStatusFilter =
  | "all"
  | "none"
  | (typeof PAYMENT_STATUSES)[number];
type TimeFilter = "all" | "upcoming" | "past" | "today";
type SortKey =
  | "starts_at"
  | "guest"
  | "service"
  | "host"
  | "status"
  | "payment";
type SortDir = "asc" | "desc";

const headerControlClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-surface px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60";

function statusLabel(
  t: ReturnType<typeof useTranslations<"bookings">>,
  status: string,
) {
  if (status === "confirmed") return t("statuses.confirmed");
  if (status === "pending_payment") return t("statuses.pending_payment");
  if (status === "cancelled") return t("statuses.cancelled");
  if (status === "completed") return t("statuses.completed");
  if (status === "no_show") return t("statuses.no_show");
  return status;
}

function paymentLabel(
  t: ReturnType<typeof useTranslations<"bookings">>,
  status: string,
) {
  if (status === "paid") return t("payment.paid");
  if (status === "pending") return t("payment.pending");
  if (status === "failed") return t("payment.failed");
  if (status === "cancelled") return t("payment.cancelled");
  if (status === "expired") return t("payment.expired");
  if (status === "refunded") return t("payment.refunded");
  return status;
}

export function BookingsList({
  locale,
  canManage,
  timezone,
  bookings,
}: {
  locale: string;
  canManage: boolean;
  timezone: string;
  bookings: BookingListItem[];
}) {
  const t = useTranslations("bookings");
  const tc = useTranslations("calendar");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [slots, setSlots] = useState<RescheduleSlotOption[] | null>(null);
  const [slotsPending, startSlots] = useTransition();
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [guestQuery, setGuestQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">(
    "all",
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>(
    "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>("starts_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const deferredGuest = useDeferredValue(guestQuery);

  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const booking of bookings) {
      map.set(booking.serviceId, booking.serviceTitle);
    }
    return [...map.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }, [bookings]);

  const hostOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const booking of bookings) {
      map.set(booking.hostUserId, booking.hostName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [bookings]);

  const filteredSorted = useMemo(() => {
    const guestQ = deferredGuest.trim().toLowerCase();
    const now = Date.now();
    const todayIso = zonedDateIso(new Date(), timezone);

    const rows = bookings.filter((booking) => {
      if (guestQ) {
        const haystack = `${booking.guestName} ${booking.guestEmail}`.toLowerCase();
        if (!haystack.includes(guestQ)) return false;
      }
      if (timeFilter === "upcoming") {
        if (new Date(booking.startsAt).getTime() < now) return false;
      } else if (timeFilter === "past") {
        if (new Date(booking.startsAt).getTime() >= now) return false;
      } else if (timeFilter === "today") {
        if (zonedDateIso(new Date(booking.startsAt), timezone) !== todayIso) {
          return false;
        }
      }
      if (serviceFilter !== "all" && booking.serviceId !== serviceFilter) {
        return false;
      }
      if (hostFilter !== "all" && booking.hostUserId !== hostFilter) {
        return false;
      }
      if (statusFilter !== "all" && booking.status !== statusFilter) {
        return false;
      }
      if (paymentFilter === "none") {
        if (booking.paymentStatus) return false;
      } else if (paymentFilter !== "all") {
        if (booking.paymentStatus !== paymentFilter) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "starts_at") {
        cmp = a.startsAt.localeCompare(b.startsAt);
      } else if (sortKey === "guest") {
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
      } else if (sortKey === "status") {
        cmp = statusLabel(t, a.status).localeCompare(
          statusLabel(t, b.status),
          undefined,
          { sensitivity: "base" },
        );
      } else {
        const aPay = a.paymentStatus
          ? paymentLabel(t, a.paymentStatus)
          : t("payment.none");
        const bPay = b.paymentStatus
          ? paymentLabel(t, b.paymentStatus)
          : t("payment.none");
        cmp = aPay.localeCompare(bPay, undefined, { sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [
    bookings,
    deferredGuest,
    timeFilter,
    serviceFilter,
    hostFilter,
    statusFilter,
    paymentFilter,
    sortKey,
    sortDir,
    timezone,
    t,
  ]);

  const filtersActive = Boolean(
    guestQuery.trim() ||
      timeFilter !== "all" ||
      serviceFilter !== "all" ||
      hostFilter !== "all" ||
      statusFilter !== "all" ||
      paymentFilter !== "all",
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "starts_at" ? "desc" : "asc");
  }

  function SortButton({
    column,
    label,
  }: {
    column: SortKey;
    label: string;
  }) {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-0.5 py-0.5 text-left font-medium transition-colors",
          "hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          active ? "text-brand" : "text-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    );
  }

  function clearFilters() {
    setGuestQuery("");
    setTimeFilter("all");
    setServiceFilter("all");
    setHostFilter("all");
    setStatusFilter("all");
    setPaymentFilter("all");
  }

  const availableDays = useMemo(() => {
    if (!slots) return [] as string[];
    return [...new Set(slots.map((slot) => slot.dateIso))];
  }, [slots]);

  const daySlots = useMemo(
    () => (slots ?? []).filter((slot) => slot.dateIso === dateIso),
    [slots, dateIso],
  );

  const selectedSlot =
    (slots ?? []).find((slot) => slot.startsAt === slotStart) ?? null;

  function openReschedule(appointmentId: string) {
    setRescheduleId(appointmentId);
    setSlots(null);
    setDateIso(null);
    setSlotStart(null);
    startSlots(async () => {
      const result = await listAppointmentRescheduleSlotsAction(appointmentId);
      if (result.error && !result.slots) {
        toast.error(t(`errors.${result.error}`));
        setRescheduleId(null);
        return;
      }
      const next = result.slots ?? [];
      setSlots(next);
      setDateIso(next[0]?.dateIso ?? null);
      setSlotStart(null);
    });
  }

  if (bookings.length === 0) {
    return (
      <SurfaceCard className="p-6">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </SurfaceCard>
    );
  }

  const actionColSpan = canManage ? 7 : 6;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-border bg-surface p-3 shadow-elevated md:hidden">
        <Input
          type="search"
          value={guestQuery}
          onChange={(e) => setGuestQuery(e.target.value)}
          placeholder={t("filterGuestPlaceholder")}
          aria-label={t("filterGuest")}
          className="h-10"
        />
        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
          aria-label={t("filterTime")}
          className={cn(headerControlClassName, "h-10")}
        >
          <option value="all">{t("filterAll")}</option>
          <option value="upcoming">{t("filterTimeUpcoming")}</option>
          <option value="past">{t("filterTimePast")}</option>
          <option value="today">{t("filterTimeToday")}</option>
        </select>
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          aria-label={t("filterService")}
          className={cn(headerControlClassName, "h-10")}
        >
          <option value="all">{t("filterAll")}</option>
          {serviceOptions.map((service) => (
            <option key={service.id} value={service.id}>
              {service.title}
            </option>
          ))}
        </select>
        <select
          value={hostFilter}
          onChange={(e) => setHostFilter(e.target.value)}
          aria-label={t("filterHost")}
          className={cn(headerControlClassName, "h-10")}
        >
          <option value="all">{t("filterAll")}</option>
          {hostOptions.map((host) => (
            <option key={host.id} value={host.id}>
              {host.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as BookingStatus | "all")
          }
          aria-label={t("filterStatus")}
          className={cn(headerControlClassName, "h-10")}
        >
          <option value="all">{t("filterAll")}</option>
          {BOOKING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(t, status)}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) =>
            setPaymentFilter(e.target.value as PaymentStatusFilter)
          }
          aria-label={t("filterPayment")}
          className={cn(headerControlClassName, "h-10")}
        >
          <option value="all">{t("filterAll")}</option>
          <option value="none">{t("payment.none")}</option>
          {PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {paymentLabel(t, status)}
            </option>
          ))}
        </select>
      </div>

      <SurfaceCard className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto min-w-[10rem] py-2.5 align-bottom">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="starts_at" label={t("colWhen")} />
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                    aria-label={t("filterTime")}
                    className={headerControlClassName}
                  >
                    <option value="all">{t("filterAll")}</option>
                    <option value="upcoming">{t("filterTimeUpcoming")}</option>
                    <option value="past">{t("filterTimePast")}</option>
                    <option value="today">{t("filterTimeToday")}</option>
                  </select>
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[12rem] py-2.5 align-bottom">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="guest" label={t("colGuest")} />
                  <Input
                    type="search"
                    value={guestQuery}
                    onChange={(e) => setGuestQuery(e.target.value)}
                    placeholder={t("filterGuestPlaceholder")}
                    aria-label={t("filterGuest")}
                    className={headerControlClassName}
                  />
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] py-2.5 align-bottom">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="service" label={t("colService")} />
                  <select
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    aria-label={t("filterService")}
                    className={headerControlClassName}
                  >
                    <option value="all">{t("filterAll")}</option>
                    {serviceOptions.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.title}
                      </option>
                    ))}
                  </select>
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] py-2.5 align-bottom">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="host" label={t("colHost")} />
                  <select
                    value={hostFilter}
                    onChange={(e) => setHostFilter(e.target.value)}
                    aria-label={t("filterHost")}
                    className={headerControlClassName}
                  >
                    <option value="all">{t("filterAll")}</option>
                    {hostOptions.map((host) => (
                      <option key={host.id} value={host.id}>
                        {host.name}
                      </option>
                    ))}
                  </select>
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[9rem] py-2.5 align-bottom">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="status" label={t("colStatus")} />
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as BookingStatus | "all")
                    }
                    aria-label={t("filterStatus")}
                    className={headerControlClassName}
                  >
                    <option value="all">{t("filterAll")}</option>
                    {BOOKING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(t, status)}
                      </option>
                    ))}
                  </select>
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[9rem] py-2.5 align-bottom">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="payment" label={t("colPayment")} />
                  <select
                    value={paymentFilter}
                    onChange={(e) =>
                      setPaymentFilter(e.target.value as PaymentStatusFilter)
                    }
                    aria-label={t("filterPayment")}
                    className={headerControlClassName}
                  >
                    <option value="all">{t("filterAll")}</option>
                    <option value="none">{t("payment.none")}</option>
                    {PAYMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {paymentLabel(t, status)}
                      </option>
                    ))}
                  </select>
                </div>
              </TableHead>
              {canManage ? (
                <TableHead className="h-auto py-2.5 align-bottom">
                  {t("colActions")}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={actionColSpan}
                  className="px-5 py-8 text-center whitespace-normal text-[15px] text-muted-foreground"
                >
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              filteredSorted.map((booking) => {
            const actionable =
              booking.status === "confirmed" ||
              booking.status === "pending_payment";
            const unpaid =
              booking.status === "pending_payment" &&
              booking.paymentStatus === "pending";
            const rescheduling = rescheduleId === booking.id;

            return (
              <TableRow key={booking.id} className="align-top">
                <TableCell className="whitespace-nowrap text-sm">
                  {new Date(booking.startsAt).toLocaleString(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell>
                  {booking.personId ? (
                    <div className="space-y-0.5">
                      <Link
                        href={`/people/${booking.personId}`}
                        className="text-sm font-medium text-action hover:underline"
                      >
                        {booking.guestName}
                      </Link>
                      <Link
                        href={`/people/${booking.personId}`}
                        className="block text-xs text-muted-foreground hover:text-action hover:underline"
                      >
                        {booking.guestEmail}
                      </Link>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-medium text-brand">
                        {booking.guestName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {booking.guestEmail}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">{booking.serviceTitle}</TableCell>
                <TableCell className="text-sm">{booking.hostName}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {statusLabel(t, booking.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {booking.paymentStatus ? (
                    <div className="space-y-1">
                      <Badge
                        variant={
                          booking.paymentStatus === "paid"
                            ? "default"
                            : "outline"
                        }
                      >
                        {paymentLabel(t, booking.paymentStatus)}
                      </Badge>
                      {booking.paymentAmountCents != null ? (
                        <p className="text-xs text-muted-foreground">
                          {formatPriceCents(
                            booking.paymentAmountCents,
                            locale,
                            booking.paymentCurrency ?? "CAD",
                          )}
                        </p>
                      ) : null}
                      {booking.payUrl ? (
                        <a
                          href={booking.payUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs font-medium text-action hover:underline"
                        >
                          {t("openPayLink")}
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("payment.none")}
                    </span>
                  )}
                </TableCell>
                {canManage ? (
                  <TableCell className="min-w-[12rem]">
                    {actionable ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending || slotsPending}
                            onClick={() => openReschedule(booking.id)}
                          >
                            <CalendarClock className="size-3.5" />
                            {t("modify")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              if (!window.confirm(t("cancelConfirm"))) return;
                              startTransition(async () => {
                                const result = await cancelAppointmentAction(
                                  booking.id,
                                  locale,
                                );
                                if (result.error) {
                                  toast.error(t(`errors.${result.error}`));
                                  return;
                                }
                                toast.success(t("cancelled"));
                                router.refresh();
                              });
                            }}
                          >
                            {t("cancel")}
                          </Button>
                          {unpaid ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => {
                                startTransition(async () => {
                                  const result =
                                    await sendBookingPaymentReminderAction(
                                      booking.id,
                                      locale,
                                    );
                                  if (result.error) {
                                    toast.error(t(`errors.${result.error}`));
                                    return;
                                  }
                                  toast.success(t("reminderSent"));
                                });
                              }}
                            >
                              <Mail className="size-3.5" />
                              {t("sendReminder")}
                            </Button>
                          ) : null}
                        </div>

                        {rescheduling ? (
                          <div className="rounded-xl border border-border bg-canvas p-3">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-brand">
                                  {tc("changeTimeTitle")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {tc("changeTimeHelp")}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending || slotsPending}
                                aria-label={tc("rescheduleBack")}
                                onClick={() => setRescheduleId(null)}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>

                            {slotsPending && !slots ? (
                              <p className="text-xs text-muted-foreground">
                                {tc("saving")}
                              </p>
                            ) : !slots || slots.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {tc("noRescheduleSlots")}
                              </p>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                                  {availableDays.map((day) => {
                                    const noon = zonedCivilToUtc(
                                      day,
                                      "12:00",
                                      timezone,
                                    );
                                    const selected = day === dateIso;
                                    return (
                                      <button
                                        key={day}
                                        type="button"
                                        disabled={pending}
                                        onClick={() => {
                                          setDateIso(day);
                                          setSlotStart(null);
                                        }}
                                        className={cn(
                                          "shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-xs",
                                          selected
                                            ? "border-action bg-action/5 text-brand"
                                            : "border-border bg-surface text-muted-foreground hover:border-action/40",
                                        )}
                                      >
                                        <span className="block font-medium">
                                          {formatDateInZone(
                                            noon,
                                            timezone,
                                            locale,
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {daySlots.map((slot) => {
                                    const selected =
                                      slot.startsAt === slotStart;
                                    return (
                                      <button
                                        key={slot.startsAt}
                                        type="button"
                                        disabled={pending}
                                        onClick={() =>
                                          setSlotStart(slot.startsAt)
                                        }
                                        className={cn(
                                          "rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                                          selected
                                            ? "border-action bg-action text-action-foreground"
                                            : "border-border bg-surface text-brand hover:border-action/40",
                                        )}
                                      >
                                        {formatTimeInZone(
                                          new Date(slot.startsAt),
                                          timezone,
                                          locale,
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!selectedSlot || pending}
                                  onClick={() => {
                                    if (!selectedSlot) return;
                                    startTransition(async () => {
                                      const result =
                                        await rescheduleAppointmentAction({
                                          appointmentId: booking.id,
                                          locale,
                                          startsAt: selectedSlot.startsAt,
                                          endsAt: selectedSlot.endsAt,
                                        });
                                      if (result.error) {
                                        toast.error(t(`errors.${result.error}`));
                                        return;
                                      }
                                      toast.success(t("modified"));
                                      setRescheduleId(null);
                                      router.refresh();
                                    });
                                  }}
                                >
                                  {pending ? tc("saving") : tc("saveNewTime")}
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })
            )}
          </TableBody>
        </Table>
      </SurfaceCard>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("showingCount", {
            shown: filteredSorted.length,
            total: bookings.length,
          })}
        </p>
        {filtersActive ? (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            {t("clearFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
