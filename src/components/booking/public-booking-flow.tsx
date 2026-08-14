"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  submitPublicBookingAction,
  type PublicBookingState,
} from "@/app/actions/public-booking";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { formatPriceCents, generateServiceSlots } from "@/lib/booking/slots";
import type { BookingServiceRow, PublicHostCalendar } from "@/lib/booking/types";
import {
  formatDateTimeInZone,
  formatTimeInZone,
  zonedDateIso,
} from "@/lib/booking/timezone";

export type PublicBookingPayload = {
  token: string;
  organizationName: string;
  timezone: string;
  bookingWindowDays: number;
  minNoticeHours: number;
  bufferMinutes: number;
  services: BookingServiceRow[];
  hosts: PublicHostCalendar[];
};

const initialState: PublicBookingState = {};

export function PublicBookingFlow({
  locale,
  payload,
}: {
  locale: string;
  payload: PublicBookingPayload;
}) {
  const t = useTranslations("booking");
  const [hostUserId, setHostUserId] = useState<string | null>(
    payload.hosts[0]?.userId ?? null,
  );
  const [serviceId, setServiceId] = useState<string | null>(
    payload.services[0]?.id ?? null,
  );
  const todayIso = zonedDateIso(new Date(), payload.timezone);
  const [cursor, setCursor] = useState(() => {
    const [year, month] = todayIso.split("-").map(Number);
    return { year, monthIndex: month - 1 };
  });
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    submitPublicBookingAction,
    initialState,
  );

  const host = payload.hosts.find((row) => row.userId === hostUserId) ?? null;
  const service = payload.services.find((row) => row.id === serviceId) ?? null;
  const slots = useMemo(() => {
    if (!service || !host) return [];
    return generateServiceSlots({
      durationMinutes: service.duration_minutes,
      rules: host.rules,
      blocked: host.blocked,
      busy: host.busy,
      window: {
        timezone: payload.timezone,
        bookingWindowDays: payload.bookingWindowDays,
        minNoticeHours: payload.minNoticeHours,
        bufferMinutes: payload.bufferMinutes,
      },
    });
  }, [host, payload, service]);

  const availableDays = useMemo(
    () => new Set(slots.map((slot) => slot.dateIso)),
    [slots],
  );
  const daySlots = slots.filter((slot) => slot.dateIso === dateIso);
  const selectedSlot = slots.find((slot) => slot.startsAt === slotStart) ?? null;
  const hostStep = payload.hosts.length > 1;
  const serviceStep = hostStep ? 2 : 1;
  const slotStep = hostStep ? 3 : 2;
  const detailsStep = hostStep ? 4 : 3;

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const date = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    });
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
              payload.timezone,
              locale,
            ),
            host: state.hostName ?? payload.organizationName,
            org: payload.organizationName,
          })}
        </p>
        {state.meetJoinUrl?.startsWith("https://") ? (
          <p>
            <a
              href={state.meetJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90"
            >
              {t("joinMeet")}
            </a>
          </p>
        ) : null}
        {state.manageToken ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">{t("manageHint")}</p>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
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
          </div>
        ) : null}
      </div>
    );
  }

  if (payload.hosts.length === 0) {
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

  if (payload.services.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("noServicesTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {t("noServicesBody")}
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
        {host && payload.hosts.length === 1 ? (
          <p className="text-sm font-medium text-brand">
            {t("bookingWith", { name: host.name })}
          </p>
        ) : null}
      </header>

      {payload.hosts.length > 1 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("chooseHost", { n: 1 })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {payload.hosts.map((row) => {
              const selected = row.userId === hostUserId;
              return (
                <button
                  key={row.userId}
                  type="button"
                  onClick={() => {
                    setHostUserId(row.userId);
                    setSlotStart(null);
                    setDateIso(null);
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-action bg-action/5"
                      : "border-border bg-surface hover:border-action/40"
                  }`}
                >
                  <p className="font-heading font-semibold text-brand">
                    {row.name}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("chooseService", { n: serviceStep })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {payload.services.map((row) => {
            const selected = row.id === serviceId;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setServiceId(row.id);
                  setSlotStart(null);
                  setDateIso(null);
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-action bg-action/5"
                    : "border-border bg-surface hover:border-action/40"
                }`}
              >
                <p className="font-heading font-semibold text-brand">{row.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("durationMinutes", { minutes: row.duration_minutes })}
                  {" · "}
                  {formatPriceCents(row.price_cents, locale, row.currency)}
                </p>
                {row.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {row.description}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("chooseSlot", { n: slotStep })}
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
      </section>

      {selectedSlot && service ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("yourDetails", { n: detailsStep })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {host ? `${host.name} · ` : null}
            {service.title} ·{" "}
            {formatDateTimeInZone(
              new Date(selectedSlot.startsAt),
              payload.timezone,
              locale,
            )}
          </p>
          {state.error ? (
            <p className="text-sm text-destructive">
              {t(`errors.${state.error}`)}
            </p>
          ) : null}
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="token" value={payload.token} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="hostUserId" value={host?.userId ?? ""} />
            <input type="hidden" name="serviceId" value={service.id} />
            <input type="hidden" name="startsAt" value={selectedSlot.startsAt} />
            <input type="hidden" name="endsAt" value={selectedSlot.endsAt} />
            <div className="space-y-2">
              <Label htmlFor="guestName">{t("name")}</Label>
              <Input id="guestName" name="guestName" required autoComplete="name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="guestEmail">{t("email")}</Label>
                <Input
                  id="guestEmail"
                  name="guestEmail"
                  type="email"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guestPhone">{t("phone")}</Label>
                <Input
                  id="guestPhone"
                  name="guestPhone"
                  type="tel"
                  required
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestAddress">{t("address")}</Label>
              <Input
                id="guestAddress"
                name="guestAddress"
                required
                autoComplete="street-address"
              />
            </div>
            <label className="flex items-start gap-2 text-sm leading-relaxed">
              <input
                type="checkbox"
                name="privacyAccepted"
                value="on"
                required
                className="mt-1 size-4 rounded border-input"
              />
              <span>
                {t("privacyConsent")}{" "}
                <Link href="/privacy" className="text-action underline-offset-2 hover:underline">
                  {t("privacyPolicy")}
                </Link>
                .
              </span>
            </label>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t("booking") : t("confirm")}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
