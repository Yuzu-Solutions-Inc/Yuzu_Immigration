"use client";

import { CalendarClock, Mail, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

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

  return (
    <SurfaceCard className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colWhen")}</TableHead>
            <TableHead>{t("colGuest")}</TableHead>
            <TableHead>{t("colService")}</TableHead>
            <TableHead>{t("colHost")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead>{t("colPayment")}</TableHead>
            {canManage ? <TableHead>{t("colActions")}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((booking) => {
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
          })}
        </TableBody>
      </Table>
    </SurfaceCard>
  );
}
