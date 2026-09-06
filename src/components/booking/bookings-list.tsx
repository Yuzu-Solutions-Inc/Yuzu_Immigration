"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Mail,
  Trash2,
  Video,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
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
import { loadBookingsPageAction } from "@/app/actions/list-pages";
import { BookingContractsButton } from "@/components/booking/booking-contracts-button";
import { SurfaceCard } from "@/components/layout/surface-card";
import {
  ListTableCard,
  listFooterClassName,
  listMobileEmptyClassName,
  listMobileFiltersClassName,
  listMobileFiltersStackClassName,
  listMobileItemClassName,
  listTableCardViewportClassName,
  listTableEdgeEndClassName,
  listTableEdgeStartClassName,
  listTableEmptyCellClassName,
  listTableHeadClassName,
  listTableScrollClassName,
  listTableStickyHeaderClassName,
  listViewportStackClassName,
} from "@/components/layout/list-layout";
import { ListLoadMore } from "@/components/layout/list-load-more";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import {
  BOOKING_LIST_STATUSES,
  BOOKING_PAYMENT_STATUSES,
  type BookingListItem,
  type BookingPaymentFilter,
  type BookingTimeFilter,
} from "@/lib/booking/bookings-list-shared";
import type { ListPage } from "@/lib/lists/pagination";
import { meetingJoinUrl as joinUrlInWindow } from "@/lib/booking/join-window";
import { formatPriceCents } from "@/lib/booking/slots";
import {
  formatDateInZone,
  formatTimeInZone,
  intlLocale,
  zonedCivilToUtc,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const BOOKING_STATUSES = BOOKING_LIST_STATUSES;
const PAYMENT_STATUSES = BOOKING_PAYMENT_STATUSES;
type BookingStatus = (typeof BOOKING_STATUSES)[number];
type PaymentStatusFilter = BookingPaymentFilter;
type TimeFilter = BookingTimeFilter;
type SortKey =
  | "starts_at"
  | "guest"
  | "service"
  | "host"
  | "status"
  | "payment";
type SortDir = "asc" | "desc";

function meetingJoinUrl(booking: BookingListItem, now: number) {
  return joinUrlInWindow({
    url: booking.meetJoinUrl,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    now,
  });
}

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

function BookingSortButton({
  column,
  label,
  sortKey,
  sortDir,
  onToggle,
}: {
  column: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
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

export function BookingsList({
  locale,
  canManage,
  currentUserId,
  timezone,
  hasAny,
  initial,
  initialPayment,
  initialTime,
  serviceOptions,
  hostOptions,
}: {
  locale: string;
  canManage: boolean;
  currentUserId: string;
  timezone: string;
  hasAny: boolean;
  initial: ListPage<BookingListItem>;
  initialPayment: PaymentStatusFilter;
  initialTime: TimeFilter;
  serviceOptions: { id: string; title: string }[];
  hostOptions: { id: string; name: string }[];
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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(initialTime);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">(
    "all",
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>(
    initialPayment,
  );
  const [sortKey, setSortKey] = useState<SortKey>("starts_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [listEpoch, setListEpoch] = useState(0);
  const debouncedGuest = useDebouncedValue(guestQuery);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const filters = useMemo(
    () => ({
      guestQuery: debouncedGuest,
      time: timeFilter,
      serviceId: serviceFilter,
      hostUserId: hostFilter,
      status: statusFilter,
      payment: paymentFilter,
      sortKey,
      sortDir,
      timezone,
      locale,
    }),
    [
      debouncedGuest,
      timeFilter,
      serviceFilter,
      hostFilter,
      statusFilter,
      paymentFilter,
      sortKey,
      sortDir,
      timezone,
      locale,
    ],
  );
  const fetchPage = useCallback(
    (offset: number) => loadBookingsPageAction({ ...filters, offset }),
    [filters],
  );
  const { items, total, loading, loadingMore, hasMore, loadMore } = usePagedList({
    initial,
    depsKey: `${JSON.stringify(filters)}:${listEpoch}`,
    fetchPage,
  });
  const filteredSorted = items;

  const filtersActive = Boolean(
    guestQuery.trim() ||
      timeFilter !== "upcoming" ||
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
    setSortDir("asc");
  }

  function clearFilters() {
    setGuestQuery("");
    setTimeFilter("upcoming");
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

  const reschedulingBooking = useMemo(
    () => items.find((booking) => booking.id === rescheduleId) ?? null,
    [items, rescheduleId],
  );

  function closeReschedule() {
    setRescheduleId(null);
    setSlots(null);
    setDateIso(null);
    setSlotStart(null);
  }

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

  if (!hasAny) {
    return (
      <SurfaceCard>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </SurfaceCard>
    );
  }

  const actionColSpan = canManage ? 7 : 6;

  return (
    <div
      className={listViewportStackClassName}
      aria-busy={loading || loadingMore}
    >
      <div className={listMobileFiltersStackClassName}>
      <div className={cn(listMobileFiltersClassName, "shrink-0")}>
        <Input
          type="search"
          value={guestQuery}
          onChange={(e) => setGuestQuery(e.target.value)}
          placeholder={t("filterGuestPlaceholder")}
          aria-label={t("filterGuest")}
        />
        <NativeSelect
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
          aria-label={t("filterTime")}
          >
          <option value="all">{t("filterAll")}</option>
          <option value="upcoming">{t("filterTimeUpcoming")}</option>
          <option value="past">{t("filterTimePast")}</option>
          <option value="today">{t("filterTimeToday")}</option>
        </NativeSelect>
        <NativeSelect
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          aria-label={t("filterService")}
          >
          <option value="all">{t("filterAll")}</option>
          {serviceOptions.map((service) => (
            <option key={service.id} value={service.id}>
              {service.title}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={hostFilter}
          onChange={(e) => setHostFilter(e.target.value)}
          aria-label={t("filterHost")}
          >
          <option value="all">{t("filterAll")}</option>
          {hostOptions.map((host) => (
            <option key={host.id} value={host.id}>
              {host.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as BookingStatus | "all")
          }
          aria-label={t("filterStatus")}
          >
          <option value="all">{t("filterAll")}</option>
          {BOOKING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(t, status)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={paymentFilter}
          onChange={(e) =>
            setPaymentFilter(e.target.value as PaymentStatusFilter)
          }
          aria-label={t("filterPayment")}
          >
          <option value="all">{t("filterAll")}</option>
          <option value="none">{t("payment.none")}</option>
          {PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {paymentLabel(t, status)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {filteredSorted.length === 0 ? (
        <p className={listMobileEmptyClassName}>{t("noMatches")}</p>
      ) : (
        <ul className="space-y-2">
          {filteredSorted.map((booking) => {
            const actionable =
              booking.status === "confirmed" ||
              booking.status === "pending_payment";
            const unpaid =
              booking.status === "pending_payment" &&
              booking.paymentStatus === "pending";
            const start = new Date(booking.startsAt);
            const joinUrl = meetingJoinUrl(booking, nowMs);
            return (
              <li key={booking.id} className={listMobileItemClassName}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-brand">
                      {new Intl.DateTimeFormat(intlLocale(locale), {
                        timeZone: timezone,
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(start)}{" "}
                      <span className="font-normal tabular-nums text-muted-foreground">
                        {formatTimeInZone(start, timezone, locale)}
                      </span>
                    </p>
                    {booking.personId ? (
                      <Link
                        href={`/partners/${booking.personId}`}
                        className="block truncate text-sm font-medium text-action hover:underline"
                      >
                        {booking.guestName}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium text-brand">
                        {booking.guestName}
                      </p>
                    )}
                    <p className="truncate text-sm text-muted-foreground">
                      {booking.serviceTitle} · {booking.hostName}
                    </p>
                  </div>
                  {joinUrl ? (
                    <a
                      href={joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ size: "xs" }),
                        "shrink-0 bg-action text-action-foreground hover:bg-action/90",
                      )}
                    >
                      <Video className="size-3.5" aria-hidden />
                      {t("joinNow")}
                    </a>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">
                    {statusLabel(t, booking.status)}
                  </Badge>
                  {booking.paymentStatus ? (
                    <Badge
                      variant={
                        booking.paymentStatus === "paid" ? "default" : "outline"
                      }
                    >
                      {paymentLabel(t, booking.paymentStatus)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("payment.none")}
                    </span>
                  )}
                  {booking.paymentAmountCents != null ? (
                    <span className="text-xs text-muted-foreground">
                      {formatPriceCents(
                        booking.paymentAmountCents,
                        locale,
                        booking.paymentCurrency ?? "CAD",
                      )}
                    </span>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                    <BookingContractsButton
                      locale={locale}
                      appointmentId={booking.id}
                      guestName={booking.guestName}
                      hostName={booking.hostName}
                      isHost={booking.hostUserId === currentUserId}
                      contracts={booking.contracts}
                    />
                    {actionable ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending || slotsPending}
                          className="text-muted-foreground"
                          onClick={() => openReschedule(booking.id)}
                          aria-label={t("modify")}
                          title={t("modify")}
                        >
                          <CalendarClock className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("cancel")}
                          title={t("cancel")}
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
                              setListEpoch((value) => value + 1);
                              router.refresh();
                            });
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        {unpaid ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={pending}
                            aria-label={t("sendReminder")}
                            title={t("sendReminder")}
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
                            <Mail className="size-4" />
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ListLoadMore
        hasMore={hasMore}
        loading={loading || loadingMore}
        onLoadMore={loadMore}
        loadMoreLabel={t("loadMore")}
        loadingLabel={t("loadingMore")}
      />
      </div>

      <ListTableCard
        className={cn("hidden md:block", listTableCardViewportClassName)}
      >
        <div className={listTableScrollClassName} data-list-scroll="">
        <Table>
          <TableHeader className={listTableStickyHeaderClassName}>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(
                  listTableHeadClassName,
                  listTableEdgeStartClassName,
                )}
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BookingSortButton
                    column="starts_at"
                    label={t("colWhen")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                  <NativeSelect
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                    aria-label={t("filterTime")}
                    density="dense"
                  >
                    <option value="all">{t("filterAll")}</option>
                    <option value="upcoming">{t("filterTimeUpcoming")}</option>
                    <option value="past">{t("filterTimePast")}</option>
                    <option value="today">{t("filterTimeToday")}</option>
                  </NativeSelect>
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BookingSortButton
                    column="guest"
                    label={t("colGuest")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                  <Input
                    type="search"
                    value={guestQuery}
                    onChange={(e) => setGuestQuery(e.target.value)}
                    placeholder={t("filterGuestPlaceholder")}
                    aria-label={t("filterGuest")}
                    density="dense"
                  />
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BookingSortButton
                    column="service"
                    label={t("colService")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                  <NativeSelect
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    aria-label={t("filterService")}
                    density="dense"
                  >
                    <option value="all">{t("filterAll")}</option>
                    {serviceOptions.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.title}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BookingSortButton
                    column="host"
                    label={t("colHost")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                  <NativeSelect
                    value={hostFilter}
                    onChange={(e) => setHostFilter(e.target.value)}
                    aria-label={t("filterHost")}
                    density="dense"
                  >
                    <option value="all">{t("filterAll")}</option>
                    {hostOptions.map((host) => (
                      <option key={host.id} value={host.id}>
                        {host.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BookingSortButton
                    column="status"
                    label={t("colStatus")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                  <NativeSelect
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as BookingStatus | "all")
                    }
                    aria-label={t("filterStatus")}
                    density="dense"
                  >
                    <option value="all">{t("filterAll")}</option>
                    {BOOKING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(t, status)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </TableHead>
              <TableHead
                className={cn(
                  listTableHeadClassName,
                )}
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BookingSortButton
                    column="payment"
                    label={t("colPayment")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                  <NativeSelect
                    value={paymentFilter}
                    onChange={(e) =>
                      setPaymentFilter(e.target.value as PaymentStatusFilter)
                    }
                    aria-label={t("filterPayment")}
                    density="dense"
                  >
                    <option value="all">{t("filterAll")}</option>
                    <option value="none">{t("payment.none")}</option>
                    {PAYMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {paymentLabel(t, status)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </TableHead>
              {canManage ? (
                <TableHead
                  className={cn(
                    "w-12",
                    listTableHeadClassName,
                    listTableEdgeEndClassName,
                  )}
                >
                  <span className="sr-only">{t("colActions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={actionColSpan}
                  className={listTableEmptyCellClassName}
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
            const start = new Date(booking.startsAt);
            const joinUrl = meetingJoinUrl(booking, nowMs);

            return (
              <TableRow key={booking.id} className="group">
                <TableCell
                  className={cn(
                    "whitespace-normal",
                    listTableEdgeStartClassName,
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 leading-tight">
                      <div className="text-sm font-medium text-brand">
                        {new Intl.DateTimeFormat(intlLocale(locale), {
                          timeZone: timezone,
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(start)}
                      </div>
                      <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {formatTimeInZone(start, timezone, locale)}
                      </div>
                    </div>
                    {joinUrl ? (
                      <a
                        href={joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ size: "xs" }),
                          "bg-action text-action-foreground hover:bg-action/90",
                        )}
                      >
                        <Video className="size-3.5" aria-hidden />
                        {t("joinNow")}
                      </a>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-0 whitespace-normal">
                  {booking.personId ? (
                    <div className="min-w-0 space-y-0.5">
                      <Link
                        href={`/partners/${booking.personId}`}
                        className="block truncate text-sm font-medium text-action hover:underline"
                      >
                        {booking.guestName}
                      </Link>
                      <Link
                        href={`/partners/${booking.personId}`}
                        className="block truncate text-xs text-muted-foreground hover:text-action hover:underline"
                      >
                        {booking.guestEmail}
                      </Link>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-brand">
                        {booking.guestName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {booking.guestEmail}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="min-w-0 truncate text-sm">
                  {booking.serviceTitle}
                </TableCell>
                <TableCell className="min-w-0 truncate text-sm">
                  {booking.hostName}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Badge variant="secondary">
                    {statusLabel(t, booking.status)}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-normal",
                    !canManage && listTableEdgeEndClassName,
                  )}
                >
                  {booking.paymentStatus ? (
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
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
                          <span className="text-xs text-muted-foreground">
                            {formatPriceCents(
                              booking.paymentAmountCents,
                              locale,
                              booking.paymentCurrency ?? "CAD",
                            )}
                          </span>
                        ) : null}
                      </div>
                      {booking.payUrl ? (
                        <a
                          href={booking.payUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs font-medium text-action hover:underline"
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
                  <TableCell className={cn("whitespace-normal", listTableEdgeEndClassName)}>
                    {actionable ? (
                      <div className="flex items-center justify-end gap-1">
                        <BookingContractsButton
                          locale={locale}
                          appointmentId={booking.id}
                          guestName={booking.guestName}
                          hostName={booking.hostName}
                          isHost={booking.hostUserId === currentUserId}
                          contracts={booking.contracts}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending || slotsPending}
                          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                          onClick={() => openReschedule(booking.id)}
                          aria-label={t("modify")}
                          title={t("modify")}
                        >
                          <CalendarClock className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive max-md:opacity-100"
                          aria-label={t("cancel")}
                          title={t("cancel")}
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
                              setListEpoch((value) => value + 1);
                              router.refresh();
                            });
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        {unpaid ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={pending}
                            aria-label={t("sendReminder")}
                            title={t("sendReminder")}
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
                            <Mail className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <BookingContractsButton
                          locale={locale}
                          appointmentId={booking.id}
                          guestName={booking.guestName}
                          hostName={booking.hostName}
                          isHost={booking.hostUserId === currentUserId}
                          contracts={booking.contracts}
                        />
                      </div>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })
            )}
          </TableBody>
        </Table>
        <ListLoadMore
          hasMore={hasMore}
          loading={loading || loadingMore}
          onLoadMore={loadMore}
          loadMoreLabel={t("loadMore")}
          loadingLabel={t("loadingMore")}
        />
        </div>
      </ListTableCard>

      <Dialog
        open={Boolean(rescheduleId)}
        onOpenChange={(open) => {
          if (!open) closeReschedule();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tc("changeTimeTitle")}</DialogTitle>
            <DialogDescription>
              {reschedulingBooking ? (
                <>
                  {reschedulingBooking.guestName} · {reschedulingBooking.serviceTitle}
                  <br />
                  {tc("changeTimeHelp")}
                </>
              ) : (
                tc("changeTimeHelp")
              )}
            </DialogDescription>
          </DialogHeader>

          {slotsPending && !slots ? (
            <p className="text-sm text-muted-foreground">{tc("saving")}</p>
          ) : !slots || slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tc("noRescheduleSlots")}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {availableDays.map((day) => {
                  const noon = zonedCivilToUtc(day, "12:00", timezone);
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
                        "shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                        selected
                          ? "border-action bg-action/10 font-medium text-brand"
                          : "border-border bg-canvas hover:border-action/40",
                      )}
                    >
                      {formatDateInZone(noon, timezone, locale)}
                    </button>
                  );
                })}
              </div>

              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tc("noRescheduleSlotsDay")}
                </p>
              ) : (
                <div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
                  {daySlots.map((slot) => {
                    const selected = slot.startsAt === slotStart;
                    return (
                      <button
                        key={slot.startsAt}
                        type="button"
                        disabled={pending}
                        onClick={() => setSlotStart(slot.startsAt)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-xs tabular-nums transition-colors",
                          selected
                            ? "border-action bg-action text-action-foreground"
                            : "border-border bg-canvas hover:border-action/50",
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
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending || slotsPending}
              onClick={closeReschedule}
            >
              {tc("rescheduleBack")}
            </Button>
            <Button
              type="button"
              disabled={!selectedSlot || pending || slotsPending}
              onClick={() => {
                if (!selectedSlot || !rescheduleId) return;
                startTransition(async () => {
                  const result = await rescheduleAppointmentAction({
                    appointmentId: rescheduleId,
                    locale,
                    startsAt: selectedSlot.startsAt,
                    endsAt: selectedSlot.endsAt,
                  });
                  if (result.error) {
                    toast.error(t(`errors.${result.error}`));
                    return;
                  }
                  toast.success(t("modified"));
                  closeReschedule();
                  setListEpoch((value) => value + 1);
                  router.refresh();
                });
              }}
            >
              {pending ? tc("saving") : tc("saveNewTime")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={listFooterClassName}>
        <p className="text-sm text-muted-foreground">
          {t("showingCount", {
            shown: filteredSorted.length,
            total,
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
