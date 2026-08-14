"use client";

import { Ban, CalendarDays, Settings2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  blockDayAction,
  cancelAppointmentAction,
  unblockTimeAction,
} from "@/app/actions/booking";
import { CopyBookingLinkButton } from "@/components/booking/copy-booking-link-button";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import type {
  BookingAppointmentRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingSettingsRow,
} from "@/lib/booking/types";
import { formatPriceCents } from "@/lib/booking/slots";
import {
  addDaysToIsoDate,
  formatTimeInZone,
  zonedDateIso,
} from "@/lib/booking/timezone";

export function CalendarWorkspace({
  locale,
  canManage,
  settings,
  appointments,
  blocked,
  googleBusy,
  hostNames,
}: {
  locale: string;
  canManage: boolean;
  settings: BookingSettingsRow | null;
  appointments: BookingAppointmentRow[];
  blocked: BookingBlockedTimeRow[];
  googleBusy: BookingGoogleBusyRow[];
  hostNames: Record<string, string>;
}) {
  const t = useTranslations("calendar");
  const timeZone = settings?.timezone ?? "America/Toronto";
  const todayIso = zonedDateIso(new Date(), timeZone);
  const [cursor, setCursor] = useState(() => {
    const parts = todayIso.split("-").map(Number);
    return { year: parts[0], monthIndex: parts[1] - 1 };
  });
  const [selectedDateIso, setSelectedDateIso] = useState(todayIso);
  const [pending, startTransition] = useTransition();

  const markers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of appointments) {
      if (row.status === "cancelled") continue;
      const dateIso = zonedDateIso(new Date(row.starts_at), timeZone);
      counts[dateIso] = (counts[dateIso] ?? 0) + 1;
    }
    return counts;
  }, [appointments, timeZone]);

  const blockedDays = useMemo(() => {
    const days = new Set<string>();
    for (const row of blocked) {
      const start = zonedDateIso(new Date(row.starts_at), timeZone);
      const endInclusive = zonedDateIso(
        new Date(new Date(row.ends_at).getTime() - 1),
        timeZone,
      );
      let current = start;
      while (current <= endInclusive) {
        days.add(current);
        current = addDaysToIsoDate(current, 1);
      }
    }
    return days;
  }, [blocked, timeZone]);

  const dayAppointments = appointments.filter((row) => {
    return zonedDateIso(new Date(row.starts_at), timeZone) === selectedDateIso;
  });

  const dayBlocks = blocked.filter((row) => {
    const start = zonedDateIso(new Date(row.starts_at), timeZone);
    const endExclusive = zonedDateIso(
      new Date(new Date(row.ends_at).getTime() - 1),
      timeZone,
    );
    return selectedDateIso >= start && selectedDateIso <= endExclusive;
  });

  const dayGoogleBusy = googleBusy.filter((row) => {
    const start = zonedDateIso(new Date(row.starts_at), timeZone);
    const endExclusive = zonedDateIso(
      new Date(new Date(row.ends_at).getTime() - 1),
      timeZone,
    );
    return selectedDateIso >= start && selectedDateIso <= endExclusive;
  });

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const date = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyBookingLinkButton locale={locale} />
          <Link
            href="/calendar/settings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 className="size-4" />
            {t("settings")}
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
        <SurfaceCard>
          <MonthCalendar
            year={cursor.year}
            monthIndex={cursor.monthIndex}
            locale={locale}
            timeZone={timeZone}
            selectedDateIso={selectedDateIso}
            onSelectDate={setSelectedDateIso}
            onPrevMonth={() => shiftMonth(-1)}
            onNextMonth={() => shiftMonth(1)}
            markers={markers}
            blockedDays={blockedDays}
          />
        </SurfaceCard>

        <SurfaceCard className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("dayDetail")}
              </p>
              <h2 className="font-heading text-lg font-semibold text-brand">
                {selectedDateIso}
              </h2>
            </div>
            {dayBlocks.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await unblockTimeAction(
                        dayBlocks[0].id,
                        locale,
                      );
                      if (result.error) toast.error(t(`errors.${result.error}`));
                      else toast.success(t("dayUnblocked"));
                    });
                  }}
                >
                  {t("unblockDay")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await blockDayAction(
                        selectedDateIso,
                        locale,
                      );
                      if (result.error) toast.error(t(`errors.${result.error}`));
                      else toast.success(t("dayBlocked"));
                    });
                  }}
                >
                  <Ban className="size-4" />
                  {t("blockDay")}
                </Button>
              )}
          </div>

          {dayBlocks.length > 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("dayIsBlocked")}
            </p>
          ) : null}

          {dayGoogleBusy.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("googleBusyTitle")}
              </p>
              <ul className="space-y-1.5">
                {dayGoogleBusy.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-muted-foreground"
                  >
                    {formatTimeInZone(new Date(row.starts_at), timeZone, locale)}
                    {" – "}
                    {formatTimeInZone(new Date(row.ends_at), timeZone, locale)}
                    <span className="ml-2 text-xs">{t("googleBusyLabel")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {dayAppointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noAppointments")}</p>
          ) : (
            <ul className="space-y-3">
              {dayAppointments.map((row) => (
                <li
                  key={row.id}
                  className="space-y-2 rounded-xl border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-brand">{row.guest_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTimeInZone(
                          new Date(row.starts_at),
                          timeZone,
                          locale,
                        )}
                        {" – "}
                        {formatTimeInZone(
                          new Date(row.ends_at),
                          timeZone,
                          locale,
                        )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        row.status === "confirmed" ? "default" : "secondary"
                      }
                    >
                      {t(`status.${row.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm">
                    {row.service?.title ?? t("unknownService")}
                    {row.service
                      ? ` · ${formatPriceCents(row.service.price_cents, locale, row.service.currency)}`
                      : null}
                  </p>
                  {hostNames[row.host_user_id] ? (
                    <p className="text-xs text-muted-foreground">
                      {t("hostedBy", { name: hostNames[row.host_user_id] })}
                    </p>
                  ) : null}
                  {row.meet_join_url?.startsWith("https://") ? (
                    <a
                      href={row.meet_join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-action hover:underline"
                    >
                      {t("joinMeet")}
                    </a>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {row.guest_email} · {row.guest_phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.guest_address}
                  </p>
                  {row.person_id ? (
                    <Link
                      href={`/people/${row.person_id}`}
                      className="text-xs font-medium text-action hover:underline"
                    >
                      {t("openPerson")}
                    </Link>
                  ) : null}
                  {canManage && row.status === "confirmed" ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t("cancelConfirm"))) return;
                        startTransition(async () => {
                          const result = await cancelAppointmentAction(
                            row.id,
                            locale,
                          );
                          if (result.error) {
                            toast.error(t(`errors.${result.error}`));
                          } else {
                            toast.success(t("cancelled"));
                          }
                        });
                      }}
                    >
                      {t("cancelAppointment")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}

export function CalendarEmptyHint({
  hasServices,
}: {
  hasServices: boolean;
}) {
  const t = useTranslations("calendar");
  return (
    <SurfaceCard className="flex items-start gap-3">
      <CalendarDays className="mt-0.5 size-5 text-action" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-brand">{t("gettingStarted")}</p>
        <p className="text-sm text-muted-foreground">
          {hasServices ? t("setupHint") : t("needServices")}
        </p>
        {!hasServices ? (
          <Link
            href="/services"
            className="text-sm font-medium text-action hover:underline"
          >
            {t("goServices")}
          </Link>
        ) : (
          <Link
            href="/calendar/settings"
            className="text-sm font-medium text-action hover:underline"
          >
            {t("settings")}
          </Link>
        )}
      </div>
    </SurfaceCard>
  );
}
