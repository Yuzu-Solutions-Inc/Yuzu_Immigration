"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  cancelPublicBookingAction,
  reschedulePublicBookingAction,
  type ManageBookingState,
} from "@/app/actions/manage-booking";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { Button } from "@/components/ui/button";
import { generateServiceSlots } from "@/lib/booking/slots";
import type { ManageBookingPayload } from "@/lib/booking/types";
import {
  formatDateTimeInZone,
  formatTimeInZone,
  zonedDateIso,
} from "@/lib/booking/timezone";

const initialState: ManageBookingState = {};

export function ManageBookingFlow({
  locale,
  payload,
  initialAction,
}: {
  locale: string;
  payload: ManageBookingPayload;
  initialAction?: string;
}) {
  const t = useTranslations("bookingManage");
  const [confirmCancel, setConfirmCancel] = useState(
    initialAction === "cancel",
  );
  const todayIso = zonedDateIso(new Date(), payload.timezone);
  const [cursor, setCursor] = useState(() => {
    const [year, month] = todayIso.split("-").map(Number);
    return { year, monthIndex: month - 1 };
  });
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(
    reschedulePublicBookingAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelPublicBookingAction,
    initialState,
  );

  const slots = useMemo(() => {
    if (!payload.host || !payload.canManage) return [];
    return generateServiceSlots({
      durationMinutes: payload.durationMinutes,
      rules: payload.host.rules,
      blocked: payload.host.blocked,
      busy: payload.host.busy,
      window: {
        timezone: payload.timezone,
        bookingWindowDays: payload.bookingWindowDays,
        minNoticeHours: payload.minNoticeHours,
        bufferMinutes: payload.bufferMinutes,
      },
    }).filter((slot) => slot.startsAt !== payload.startsAt);
  }, [payload]);

  const availableDays = useMemo(
    () => new Set(slots.map((slot) => slot.dateIso)),
    [slots],
  );
  const daySlots = slots.filter((slot) => slot.dateIso === dateIso);
  const selectedSlot = slots.find((slot) => slot.startsAt === slotStart) ?? null;
  const pending = reschedulePending || cancelPending;
  const error = rescheduleState.error || cancelState.error;
  const when = formatDateTimeInZone(
    new Date(
      rescheduleState.message === "rescheduled" && rescheduleState.startsAt
        ? rescheduleState.startsAt
        : payload.startsAt,
    ),
    payload.timezone,
    locale,
  );

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const date = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    });
  }

  if (cancelState.message === "cancelled" || payload.status === "cancelled") {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("cancelledTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("cancelledBody")}</p>
      </div>
    );
  }

  if (rescheduleState.message === "rescheduled" && rescheduleState.startsAt) {
    const meet = rescheduleState.meetJoinUrl?.startsWith("https://")
      ? rescheduleState.meetJoinUrl
      : null;
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-12 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("rescheduledTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("rescheduledBody", {
            service: payload.serviceTitle,
            when,
            host: payload.hostName,
          })}
        </p>
        {meet ? (
          <p>
            <a
              href={meet}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90"
            >
              {t("joinMeet")}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  if (!payload.canManage) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("pastTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("pastBody")}</p>
        <p className="text-sm font-medium text-brand">
          {payload.serviceTitle} · {when}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <BrandLogo size="sm" href="/" />
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {payload.organizationName}
        </p>
        <h1 className="font-heading text-3xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-brand">{payload.serviceTitle}</p>
          <p className="mt-1 text-muted-foreground">
            {t("withHost", { name: payload.hostName })}
          </p>
          <p className="mt-1 font-medium text-brand">{when}</p>
        </div>
        <PrivacyLink />
      </header>

      {error ? (
        <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("changeTime")}
        </h2>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSlots")}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,1fr)]">
            <div className="rounded-xl border border-border bg-surface p-4">
              <MonthCalendar
                year={cursor.year}
                monthIndex={cursor.monthIndex}
                locale={locale}
                timeZone={payload.timezone}
                selectedDateIso={dateIso}
                onSelectDate={(next) => {
                  setDateIso(next);
                  setSlotStart(null);
                }}
                onPrevMonth={() => shiftMonth(-1)}
                onNextMonth={() => shiftMonth(1)}
                availableDays={availableDays}
              />
            </div>
            <div className="space-y-2">
              {!dateIso ? (
                <p className="text-sm text-muted-foreground">{t("pickDay")}</p>
              ) : daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noSlotsDay")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {daySlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => setSlotStart(slot.startsAt)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                        slotStart === slot.startsAt
                          ? "border-action bg-action text-white"
                          : "border-border bg-surface hover:border-action/40"
                      }`}
                    >
                      {formatTimeInZone(
                        new Date(slot.startsAt),
                        payload.timezone,
                        locale,
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {selectedSlot ? (
          <form action={rescheduleAction} className="space-y-3">
            <input type="hidden" name="token" value={payload.token} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="startsAt" value={selectedSlot.startsAt} />
            <input type="hidden" name="endsAt" value={selectedSlot.endsAt} />
            <p className="text-sm text-muted-foreground">
              {t("newTime", {
                when: formatDateTimeInZone(
                  new Date(selectedSlot.startsAt),
                  payload.timezone,
                  locale,
                ),
              })}
            </p>
            <Button type="submit" disabled={pending}>
              {reschedulePending ? t("saving") : t("saveNewTime")}
            </Button>
          </form>
        ) : null}
      </section>

      <section
        id="cancel"
        className="space-y-3 rounded-xl border border-border bg-surface p-5"
      >
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("cancelTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("cancelBody")}</p>
        {confirmCancel ? (
          <form action={cancelAction} className="space-y-3">
            <input type="hidden" name="token" value={payload.token} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="confirm" value="on" />
            <p className="text-sm font-medium text-destructive">
              {t("cancelConfirm")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={pending}>
                {cancelPending ? t("cancelling") : t("cancelButton")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmCancel(false)}
              >
                {t("keepAppointment")}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setConfirmCancel(true)}
          >
            {t("cancelAppointment")}
          </Button>
        )}
      </section>
    </div>
  );
}
