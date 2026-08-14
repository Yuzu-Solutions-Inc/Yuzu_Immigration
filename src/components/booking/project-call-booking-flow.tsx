"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  submitProjectCallBookingAction,
  type ProjectCallBookState,
} from "@/app/actions/project-call-invite";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { generateServiceSlots } from "@/lib/booking/slots";
import type { ProjectCallInviteContext } from "@/lib/booking/queries";
import {
  formatDateInZone,
  formatDateTimeInZone,
  formatMonthYear,
  formatTimeInZone,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const initialState: ProjectCallBookState = {};

export function ProjectCallBookingFlow({
  locale,
  token,
  ctx,
}: {
  locale: string;
  token: string;
  ctx: ProjectCallInviteContext;
}) {
  const t = useTranslations("booking");
  const tc = useTranslations("projectCall");
  const [cursor, setCursor] = useState(() => {
    const todayIso = zonedDateIso(new Date(), ctx.settings.timezone);
    const [year, month] = todayIso.split("-").map(Number);
    return { year, monthIndex: month - 1 };
  });
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    submitProjectCallBookingAction,
    initialState,
  );

  const slots = useMemo(
    () =>
      generateServiceSlots({
        durationMinutes: ctx.service.duration_minutes,
        rules: ctx.host.rules,
        blocked: ctx.host.blocked,
        busy: ctx.host.busy,
        window: {
          timezone: ctx.settings.timezone,
          bookingWindowDays: ctx.settings.booking_window_days,
          minNoticeHours: ctx.settings.min_notice_hours,
          bufferMinutes: ctx.settings.buffer_minutes,
        },
      }),
    [ctx],
  );

  const availableDays = useMemo(
    () => new Set(slots.map((slot) => slot.dateIso)),
    [slots],
  );
  const firstAvailableDay = useMemo(() => {
    const days = [...availableDays].sort();
    return days[0] ?? null;
  }, [availableDays]);
  const cursorPrefix = `${cursor.year}-${String(cursor.monthIndex + 1).padStart(2, "0")}-`;
  const effectiveDateIso =
    dateIso && availableDays.has(dateIso)
      ? dateIso
      : firstAvailableDay?.startsWith(cursorPrefix)
        ? firstAvailableDay
        : null;
  const daySlots = slots.filter((slot) => slot.dateIso === effectiveDateIso);
  const selectedSlot = slots.find((slot) => slot.startsAt === slotStart) ?? null;

  useEffect(() => {
    if (!firstAvailableDay) return;
    const [year, month] = firstAvailableDay.split("-").map(Number);
    setCursor({ year, monthIndex: month - 1 });
    setDateIso(firstAvailableDay);
  }, [firstAvailableDay]);

  useEffect(() => {
    if (pending || state.error !== "slot_taken") return;
    setSlotStart(null);
  }, [pending, state.error]);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.monthIndex + delta, 1));
    const year = next.getUTCFullYear();
    const monthIndex = next.getUTCMonth();
    const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
    const inMonth =
      [...availableDays].filter((day) => day.startsWith(prefix)).sort()[0] ??
      null;
    setCursor({ year, monthIndex });
    setDateIso(inMonth);
    setSlotStart(null);
  }

  if (state.message === "booked" && state.startsAt && state.serviceTitle) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-12 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("confirmedTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("confirmedBody", {
            service: state.serviceTitle,
            when: formatDateTimeInZone(
              new Date(state.startsAt),
              ctx.settings.timezone,
              locale,
            ),
            host: state.hostName ?? ctx.host.name,
            org: ctx.organizationName,
          })}
        </p>
        {state.meetJoinUrl?.startsWith("https://") ? (
          <p>
            <a
              href={state.meetJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-action-foreground hover:bg-action/90"
            >
              {t("joinMeet")}
            </a>
          </p>
        ) : null}
        {state.manageToken ? (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
            <Link
              href={`/booking/${state.manageToken}`}
              className="font-medium text-action underline-offset-2 hover:underline"
            >
              {t("changeTime")}
            </Link>
            <Link
              href={`/booking/${state.manageToken}?action=cancel`}
              className="font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("cancelAppointment")}
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  if (ctx.host.rules.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("noHostsTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {t("noHostsBody")}
        </p>
      </div>
    );
  }

  const dayHeading = effectiveDateIso
    ? formatDateInZone(
        zonedCivilToUtc(effectiveDateIso, "12:00", ctx.settings.timezone),
        ctx.settings.timezone,
        locale,
      )
    : null;

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        unavailable: t("unavailableBody"),
        already_used: tc("errors.alreadyUsed"),
        expired: tc("errors.expired"),
        revoked: tc("errors.revoked"),
        slot_taken: t("errors.slot_taken"),
        book_failed: t("errors.book_failed"),
      }[state.error] ?? t("errors.invalid")
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-6 space-y-2">
        <BrandLogo size="sm" href="/" />
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {ctx.organizationName}
        </p>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {tc("publicTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tc("publicLede", {
            host: ctx.host.name,
            minutes: ctx.service.duration_minutes,
          })}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <MonthCalendar
          year={cursor.year}
          monthIndex={cursor.monthIndex}
          locale={locale}
          timeZone={ctx.settings.timezone}
          selectedDateIso={effectiveDateIso}
          availableDays={availableDays}
          onSelectDate={(iso) => {
            setDateIso(iso);
            setSlotStart(null);
          }}
          onPrevMonth={() => shiftMonth(-1)}
          onNextMonth={() => shiftMonth(1)}
        />

        <div className="space-y-4">
          <div>
            <h2 className="font-heading text-base font-semibold text-brand">
              {dayHeading ?? t("pickDay")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {formatMonthYear(cursor.year, cursor.monthIndex, locale)}
            </p>
            {daySlots.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("noSlotsDay")}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {daySlots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => setSlotStart(slot.startsAt)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      slotStart === slot.startsAt
                        ? "border-action bg-action text-action-foreground"
                        : "border-border bg-surface text-brand hover:border-action/40",
                    )}
                  >
                    {formatTimeInZone(
                      new Date(slot.startsAt),
                      ctx.settings.timezone,
                      locale,
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="startsAt"
              value={selectedSlot?.startsAt ?? ""}
            />
            <input
              type="hidden"
              name="endsAt"
              value={selectedSlot?.endsAt ?? ""}
            />
            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={!selectedSlot || pending}
            >
              {pending
                ? t("booking")
                : selectedSlot
                  ? tc("confirmSlot", {
                      when: formatDateTimeInZone(
                        new Date(selectedSlot.startsAt),
                        ctx.settings.timezone,
                        locale,
                      ),
                    })
                  : tc("pickSlot")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
