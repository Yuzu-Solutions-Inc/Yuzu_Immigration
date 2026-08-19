"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  sendPublicBookingManageLinksAction,
  submitPublicBookingAction,
  type ManageLinksState,
  type PublicBookingState,
} from "@/app/actions/public-booking";
import { CancelPolicyNotice } from "@/components/booking/cancel-policy-notice";
import { BookingCompositeField } from "@/components/booking/booking-composite-field";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalConsentFields } from "@/components/legal/legal-consent-fields";
import { LegalLinks } from "@/components/legal/legal-links";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatPriceCents, generateServiceSlots } from "@/lib/booking/slots";
import { serviceCopy } from "@/lib/booking/service-i18n";
import { formFieldInputName, isReservedBookingFieldKey } from "@/lib/booking/form-fields";
import { isCompositeFieldType } from "@/lib/booking/composite-fields";
import type {
  BookingServiceFormFieldRow,
  BookingServiceRow,
  PublicHostCalendar,
} from "@/lib/booking/types";
import type { CancelPolicyDisplay } from "@/lib/square/cancel-policy";
import {
  APP_LOCALES,
  LOCALE_LABELS,
} from "@/lib/i18n/locales";
import {
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

export type PublicBookingPayload = {
  token: string;
  organizationName: string;
  timezone: string;
  bookingWindowDays: number;
  minNoticeHours: number;
  bufferMinutes: number;
  services: BookingServiceRow[];
  formFields: BookingServiceFormFieldRow[];
  hosts: PublicHostCalendar[];
  cancelPolicy: CancelPolicyDisplay | null;
};

const initialState: PublicBookingState = {};
const initialLinksState: ManageLinksState = {};

export function PublicBookingFlow({
  locale,
  payload,
}: {
  locale: string;
  payload: PublicBookingPayload;
}) {
  const t = useTranslations("booking");
  const [step, setStep] = useState<"schedule" | "details">("schedule");
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
  const [linksState, linksAction, linksPending] = useActionState(
    sendPublicBookingManageLinksAction,
    initialLinksState,
  );
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestPreferredLocale, setGuestPreferredLocale] = useState(locale);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [chosePayLater, setChosePayLater] = useState(false);
  const [editingAfterNotice, setEditingAfterNotice] = useState(false);
  const bookingFormRef = useRef<HTMLFormElement>(null);

  const host = payload.hosts.find((row) => row.userId === hostUserId) ?? null;
  const service = payload.services.find((row) => row.id === serviceId) ?? null;
  const serviceLabel = service ? serviceCopy(service, locale).title : "";
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
  const selectedService = payload.services.find((row) => row.id === serviceId);
  const serviceFields = payload.formFields.filter(
    (field) =>
      Boolean(selectedService?.form_id) &&
      field.form_id === selectedService?.form_id &&
      !isReservedBookingFieldKey(field.field_key),
  );
  const warningEmail = state.guestEmail ?? guestEmail;
  const existingNoticeKind =
    state.error === "too_many_bookings"
      ? "cap"
      : state.message === "existing_booking"
        ? "existing"
        : null;
  const showExistingNotice = existingNoticeKind !== null && !editingAfterNotice;
  const atBookingCap = existingNoticeKind === "cap";

  useEffect(() => {
    if (pending || state.error !== "slot_taken") return;
    setStep("schedule");
    setSlotStart(null);
  }, [pending, state.error]);

  useEffect(() => {
    if (pending) return;
    if (state.message === "existing_booking" || state.error === "too_many_bookings") {
      setEditingAfterNotice(false);
      setStep("details");
      window.scrollTo(0, 0);
    }
  }, [pending, state.message, state.error]);

  useEffect(() => {
    if (!firstAvailableDay) return;
    const [year, month] = firstAvailableDay.split("-").map(Number);
    setCursor({ year, monthIndex: month - 1 });
    setDateIso(firstAvailableDay);
  }, [serviceId, hostUserId, firstAvailableDay]);

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

  function resetSlot() {
    setSlotStart(null);
    setDateIso(null);
  }

  useEffect(() => {
    if (state.message === "payment_required" && state.checkoutUrl) {
      window.location.assign(state.checkoutUrl);
    }
  }, [state.message, state.checkoutUrl]);

  if (state.message === "choose_payment" && state.checkoutUrl && state.startsAt) {
    if (chosePayLater) {
      return (
        <div className="mx-auto max-w-lg space-y-6 px-4 py-12 text-center">
          <BrandLogo size="sm" href="/" />
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("payLaterConfirmedTitle")}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {t("payLaterConfirmedBody", {
              service: state.serviceTitle ?? "",
              when: formatDateTimeInZone(
                new Date(state.startsAt),
                payload.timezone,
                locale,
              ),
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("choosePaymentBeforeDate")}
          </p>
          <p>
            <a
              href={state.checkoutUrl}
              className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-action-foreground hover:bg-action/90"
            >
              {t("payNow")}
            </a>
          </p>
          {state.manageToken ? (
            <div className="space-y-2 text-sm">
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

    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-12 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("choosePaymentTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("choosePaymentBody", {
            service: state.serviceTitle ?? "",
            when: formatDateTimeInZone(
              new Date(state.startsAt),
              payload.timezone,
              locale,
            ),
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t("choosePaymentBeforeDate")}</p>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <a
            href={state.checkoutUrl}
            className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-action-foreground hover:bg-action/90"
          >
            {t("payNow")}
          </a>
          <Button type="button" variant="outline" onClick={() => setChosePayLater(true)}>
            {t("payLater")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("payLaterHint")}</p>
      </div>
    );
  }

  if (state.message === "payment_required" && state.checkoutUrl) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-12 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("paymentRedirectTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("paymentRedirectBody")}
        </p>
        <p>
          <a
            href={state.checkoutUrl}
            className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-action-foreground hover:bg-action/90"
          >
            {t("paymentContinue")}
          </a>
        </p>
      </div>
    );
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
              className="inline-flex items-center rounded-xl bg-action px-4 py-2 text-sm font-medium text-action-foreground hover:bg-action/90"
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
        <LegalLinks className="justify-center" />
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

  const selectedWhen = selectedSlot
    ? formatDateTimeInZone(
        new Date(selectedSlot.startsAt),
        payload.timezone,
        locale,
      )
    : null;
  const dayHeading = effectiveDateIso
    ? formatDateInZone(
        zonedCivilToUtc(effectiveDateIso, "12:00", payload.timezone),
        payload.timezone,
        locale,
      )
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4 lg:h-dvh lg:max-h-dvh lg:overflow-hidden lg:py-5">
      <header className="flex shrink-0 items-center justify-between gap-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo size="sm" href="/" />
          <div className="min-w-0 border-l border-border pl-3">
            <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {payload.organizationName}
            </p>
            <h1 className="font-heading truncate text-lg font-semibold text-brand lg:text-xl">
              {t("title")}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {host && payload.hosts.length === 1 ? (
            <p className="hidden text-sm font-medium text-brand sm:block">
              {t("bookingWith", { name: host.name })}
            </p>
          ) : null}
          <LegalLinks className="justify-end" />
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3",
          step !== "schedule" && "hidden",
        )}
        inert={step !== "schedule"}
      >
        {payload.hosts.length > 1 ? (
          <section className="shrink-0 space-y-1.5">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("chooseHost")}
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {payload.hosts.map((row) => {
                const selected = row.userId === hostUserId;
                return (
                  <button
                    key={row.userId}
                    type="button"
                    onClick={() => {
                      setHostUserId(row.userId);
                      resetSlot();
                    }}
                    className={cn(
                      "shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      selected
                        ? "border-action bg-action/5 text-brand"
                        : "border-border bg-surface text-muted-foreground hover:border-action/40",
                    )}
                  >
                    {row.name}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="shrink-0 space-y-1.5">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("chooseService")}
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {payload.services.map((row) => {
              const selected = row.id === serviceId;
              const copy = serviceCopy(row, locale);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setServiceId(row.id);
                    resetSlot();
                  }}
                  className={cn(
                    "shrink-0 rounded-xl border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-action bg-action/5"
                      : "border-border bg-surface hover:border-action/40",
                  )}
                >
                  <p className="text-sm font-semibold text-brand">{copy.title}</p>
                  {copy.description ? (
                    <p className="mt-0.5 max-w-[16rem] text-xs text-muted-foreground">
                      {copy.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t("durationMinutes", { minutes: row.duration_minutes })}
                    {" · "}
                    {formatPriceCents(row.price_cents, locale, row.currency)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSlots")}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-center lg:gap-5">
              <div className="min-h-[22rem] w-full max-w-[32rem] lg:h-[min(100%,32rem)] lg:min-h-0">
                <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-surface p-3 sm:p-4">
                  <MonthCalendar
                    year={cursor.year}
                    monthIndex={cursor.monthIndex}
                    locale={locale}
                    timeZone={payload.timezone}
                    selectedDateIso={effectiveDateIso}
                    onSelectDate={(next) => {
                      setDateIso(next);
                      setSlotStart(null);
                    }}
                    onPrevMonth={() => shiftMonth(-1)}
                    onNextMonth={() => shiftMonth(1)}
                    availableDays={availableDays}
                    fillHeight
                    compact
                  />
                </div>
              </div>
              <div className="flex min-h-0 w-full max-w-[32rem] flex-col lg:h-[min(100%,32rem)] lg:w-[15.5rem] lg:shrink-0">
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-3 sm:p-4">
                  <div className="shrink-0 pb-2">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("availableTimes")}
                    </p>
                    {dayHeading ? (
                      <p className="font-heading text-sm font-semibold text-brand">
                        {dayHeading}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {t("timesInZone", {
                        zone: payload.timezone.replaceAll("_", " "),
                      })}
                    </p>
                  </div>
                  {!effectiveDateIso ? (
                    <p className="text-sm text-muted-foreground">{t("pickDay")}</p>
                  ) : daySlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noSlotsDay")}</p>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-1">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.startsAt}
                            type="button"
                            onClick={() => setSlotStart(slot.startsAt)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-sm font-medium",
                              slotStart === slot.startsAt
                                ? "border-action bg-action text-action-foreground"
                                : "border-border bg-surface hover:border-action/40",
                            )}
                          >
                            {formatTimeInZone(
                              new Date(slot.startsAt),
                              payload.timezone,
                              locale,
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur-sm lg:static lg:bg-transparent lg:backdrop-blur-none">
          <p
            className={cn(
              "min-w-0 text-sm",
              state.error === "slot_taken"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {state.error === "slot_taken"
              ? t("errors.slot_taken")
              : selectedWhen && service
                ? `${serviceLabel} · ${selectedWhen}`
                : t("selectTimeHint")}
          </p>
          <Button
            type="button"
            disabled={!selectedSlot}
            onClick={() => {
              setStep("details");
              window.scrollTo(0, 0);
            }}
          >
            {t("continue")}
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          step !== "details" && "hidden",
        )}
        inert={step !== "details"}
      >
        <div className="flex shrink-0 items-start gap-2 pb-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (showExistingNotice) {
                setEditingAfterNotice(true);
                return;
              }
              setStep("schedule");
            }}
          >
            <ChevronLeft data-icon="inline-start" />
            {t("back")}
          </Button>
          <div className="min-w-0 pt-0.5">
            {showExistingNotice ? (
              <p className="truncate text-sm text-muted-foreground">
                {host ? `${host.name} · ` : null}
                {serviceLabel}
                {selectedWhen ? ` · ${selectedWhen}` : null}
              </p>
            ) : (
              <>
                <h2 className="font-heading text-lg font-semibold text-brand">
                  {t("yourDetails")}
                </h2>
                {selectedWhen && service ? (
                  <p className="truncate text-sm text-muted-foreground">
                    {host ? `${host.name} · ` : null}
                    {serviceLabel} · {selectedWhen}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {selectedSlot && service ? (
          <>
            {showExistingNotice ? (
              <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto pb-4">
                <div
                  role="alert"
                  className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border border-amber-100 bg-warning-bg p-5 sm:p-6"
                >
                  <div className="space-y-2">
                    <h2 className="font-heading text-xl font-semibold text-brand">
                      {atBookingCap ? t("tooManyTitle") : t("existingTitle")}
                    </h2>
                    {warningEmail ? (
                      <p className="text-sm font-medium text-brand">
                        {t("existingAppliesTo", { email: warningEmail })}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      {atBookingCap ? t("tooManyBody") : t("existingBody")}
                    </p>
                  </div>
                  <form action={linksAction} className="space-y-2">
                    <input type="hidden" name="token" value={payload.token} />
                    <input type="hidden" name="locale" value={locale} />
                    <input
                      type="hidden"
                      name="guestEmail"
                      value={warningEmail}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={linksPending || pending || !warningEmail}
                      className="w-full"
                    >
                      {linksPending ? t("sendingLinks") : t("sendLinks")}
                    </Button>
                    {linksState.message === "links_sent" ? (
                      <p className="text-sm text-muted-foreground">
                        {t("linksSent")}
                      </p>
                    ) : null}
                    {linksState.error === "cooldown" ? (
                      <p className="text-sm text-destructive">
                        {t("linksCooldown")}
                      </p>
                    ) : null}
                    {linksState.error && linksState.error !== "cooldown" ? (
                      <p className="text-sm text-destructive">
                        {t(`errors.${linksState.error}`)}
                      </p>
                    ) : null}
                  </form>
                  {atBookingCap ? null : (
                    <>
                      <p className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t("existingOr")}
                      </p>
                      <Button
                        type="button"
                        disabled={pending || linksPending}
                        className="w-full"
                        onClick={() => bookingFormRef.current?.requestSubmit()}
                      >
                        {pending ? t("booking") : t("bookAnyway")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto pb-4",
                showExistingNotice &&
                  "pointer-events-none absolute h-px w-px overflow-hidden opacity-0",
              )}
              aria-hidden={showExistingNotice}
            >
              <div className="mx-auto w-full max-w-lg space-y-4">
                {state.error &&
                !atBookingCap &&
                state.error !== "slot_taken" &&
                !showExistingNotice ? (
                  <p className="text-sm text-destructive">
                    {t(`errors.${state.error}`)}
                  </p>
                ) : null}
                <form
                  id="public-booking-form"
                  ref={bookingFormRef}
                  action={formAction}
                  className="space-y-4"
                >
                  <input type="hidden" name="token" value={payload.token} />
                  <input type="hidden" name="locale" value={locale} />
                  <input
                    type="hidden"
                    name="hostUserId"
                    value={host?.userId ?? ""}
                  />
                  <input type="hidden" name="serviceId" value={service.id} />
                  <input
                    type="hidden"
                    name="startsAt"
                    value={selectedSlot.startsAt}
                  />
                  <input
                    type="hidden"
                    name="endsAt"
                    value={selectedSlot.endsAt}
                  />
                  {showExistingNotice && !atBookingCap ? (
                    <input type="hidden" name="confirmAnother" value="on" />
                  ) : null}
                  <FieldGrid>
                    <Field>
                      <FieldLabel htmlFor="guestFirstName" required>
                        {t("firstName")}
                      </FieldLabel>
                      <Input
                        id="guestFirstName"
                        name="guestFirstName"
                        required
                        autoComplete="given-name"
                        value={guestFirstName}
                        onChange={(event) =>
                          setGuestFirstName(event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="guestLastName" required>
                        {t("lastName")}
                      </FieldLabel>
                      <Input
                        id="guestLastName"
                        name="guestLastName"
                        required
                        autoComplete="family-name"
                        value={guestLastName}
                        onChange={(event) =>
                          setGuestLastName(event.target.value)
                        }
                      />
                    </Field>
                  </FieldGrid>
                  <Field>
                    <FieldLabel htmlFor="guestPreferredLocale" required>
                      {t("preferredLanguage")}
                    </FieldLabel>
                    <NativeSelect
                      id="guestPreferredLocale"
                      name="guestPreferredLocale"
                      required
                      value={guestPreferredLocale}
                      onChange={(event) =>
                        setGuestPreferredLocale(event.target.value)
                      }
                    >
                      {APP_LOCALES.map((code) => (
                        <option key={code} value={code}>
                          {LOCALE_LABELS[code]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <FieldGrid>
                    <Field>
                      <FieldLabel htmlFor="guestEmail" required>
                        {t("email")}
                      </FieldLabel>
                      <Input
                        id="guestEmail"
                        name="guestEmail"
                        type="email"
                        required
                        autoComplete="email"
                        value={guestEmail}
                        onChange={(event) => setGuestEmail(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="guestPhone" required>
                        {t("phone")}
                      </FieldLabel>
                      <Input
                        id="guestPhone"
                        name="guestPhone"
                        type="tel"
                        required
                        autoComplete="tel"
                        value={guestPhone}
                        onChange={(event) => setGuestPhone(event.target.value)}
                      />
                    </Field>
                  </FieldGrid>
                  {serviceFields.map((field) => (
                    <PublicCustomField
                      key={field.id}
                      field={field}
                      locale={locale}
                    />
                  ))}
                  <LegalConsentFields
                    privacyChecked={privacyAccepted}
                    termsChecked={termsAccepted}
                    onPrivacyChange={setPrivacyAccepted}
                    onTermsChange={setTermsAccepted}
                    disabled={pending}
                    privacyLabel={
                      <>
                        {t("privacyConsent")}{" "}
                        <Link
                          href="/privacy"
                          className="text-action underline-offset-2 hover:underline"
                        >
                          {t("privacyPolicy")}
                        </Link>
                        .
                      </>
                    }
                  />
                  {service.price_cents > 0 && payload.cancelPolicy ? (
                    <CancelPolicyNotice
                      policy={payload.cancelPolicy}
                      locale={locale}
                      currency={service.currency}
                      paidAmountCents={service.price_cents}
                    />
                  ) : null}
                  {showExistingNotice ? null : (
                    <Button
                      type="submit"
                      disabled={
                        pending ||
                        linksPending ||
                        !privacyAccepted ||
                        !termsAccepted
                      }
                      className="w-full"
                    >
                      {pending ? t("booking") : t("confirm")}
                    </Button>
                  )}
                </form>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PublicCustomField({
  field,
  locale,
}: {
  field: BookingServiceFormFieldRow;
  locale: string;
}) {
  if (isCompositeFieldType(field.field_type)) {
    return <BookingCompositeField field={field} locale={locale} />;
  }

  const name = formFieldInputName(field.field_key);
  const hint = field.help_text ? (
    <FieldHint>{field.help_text}</FieldHint>
  ) : null;

  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm leading-relaxed">
        <input
          id={name}
          type="checkbox"
          name={name}
          value="on"
          required={field.required}
          className="mt-1 size-4 rounded border-input"
        />
        <span>
          {field.label}
          {field.required ? " *" : ""}
          {hint}
        </span>
      </label>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <Field>
        <FieldLabel htmlFor={name} required={field.required}>
          {field.label}
        </FieldLabel>
        <Textarea
          id={name}
          name={name}
          rows={3}
          required={field.required}
          maxLength={2000}
        />
        {hint}
      </Field>
    );
  }

  if (field.field_type === "select") {
    return (
      <Field>
        <FieldLabel htmlFor={name} required={field.required}>
          {field.label}
        </FieldLabel>
        <NativeSelect
          id={name}
          name={name}
          required={field.required}
          defaultValue=""
        >
          <option value="" disabled>
            —
          </option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
        {hint}
      </Field>
    );
  }

  const inputType =
    field.field_type === "email"
      ? "email"
      : field.field_type === "phone"
        ? "tel"
        : field.field_type === "number"
          ? "number"
          : field.field_type === "date"
            ? "date"
            : "text";

  return (
    <Field>
      <FieldLabel htmlFor={name} required={field.required}>
        {field.label}
      </FieldLabel>
      <Input
        id={name}
        name={name}
        type={inputType}
        required={field.required}
        maxLength={field.field_type === "text" ? 300 : undefined}
      />
      {hint}
    </Field>
  );
}
