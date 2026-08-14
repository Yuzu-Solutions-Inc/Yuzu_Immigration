"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  sendPublicBookingManageLinksAction,
  submitPublicBookingAction,
  type ManageLinksState,
  type PublicBookingState,
} from "@/app/actions/public-booking";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatPriceCents, generateServiceSlots } from "@/lib/booking/slots";
import { formFieldInputName, isReservedBookingFieldKey } from "@/lib/booking/form-fields";
import type {
  BookingServiceFormFieldRow,
  BookingServiceRow,
  PublicHostCalendar,
} from "@/lib/booking/types";
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
  const [guestAddress, setGuestAddress] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

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
  const showExistingNotice =
    state.message === "existing_booking" || state.error === "too_many_bookings";
  const atBookingCap = state.error === "too_many_bookings";

  useEffect(() => {
    if (pending || state.error !== "slot_taken") return;
    setStep("schedule");
    setSlotStart(null);
  }, [pending, state.error]);

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
        <PrivacyLink />
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
          <PrivacyLink />
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
                  <p className="text-sm font-semibold text-brand">{row.title}</p>
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
                ? `${service.title} · ${selectedWhen}`
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
          "flex min-h-0 flex-1 flex-col",
          step !== "details" && "hidden",
        )}
        inert={step !== "details"}
      >
        <div className="flex shrink-0 items-start gap-2 pb-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep("schedule")}
          >
            <ChevronLeft data-icon="inline-start" />
            {t("back")}
          </Button>
          <div className="min-w-0 pt-0.5">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("yourDetails")}
            </h2>
            {selectedWhen && service ? (
              <p className="truncate text-sm text-muted-foreground">
                {host ? `${host.name} · ` : null}
                {service.title} · {selectedWhen}
              </p>
            ) : null}
          </div>
        </div>

        {selectedSlot && service ? (
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <div className="mx-auto w-full max-w-lg space-y-4">
              {state.error && !atBookingCap && state.error !== "slot_taken" ? (
                <p className="text-sm text-destructive">
                  {t(`errors.${state.error}`)}
                </p>
              ) : null}
              {showExistingNotice ? (
                <div className="space-y-3 rounded-xl border border-amber-100 bg-warning-bg p-4">
                  <p className="text-sm font-medium text-brand">
                    {atBookingCap ? t("tooManyTitle") : t("existingTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {atBookingCap ? t("tooManyBody") : t("existingBody")}
                  </p>
                  <form action={linksAction} className="space-y-2">
                    <input type="hidden" name="token" value={payload.token} />
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="guestEmail" value={warningEmail} />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={linksPending || pending || !warningEmail}
                      className="w-full sm:w-auto"
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
                </div>
              ) : null}
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="token" value={payload.token} />
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="hostUserId" value={host?.userId ?? ""} />
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="startsAt" value={selectedSlot.startsAt} />
                <input type="hidden" name="endsAt" value={selectedSlot.endsAt} />
                {showExistingNotice &&
                !atBookingCap &&
                guestEmail.trim().toLowerCase() ===
                  warningEmail.trim().toLowerCase() ? (
                  <input type="hidden" name="confirmAnother" value="on" />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="guestFirstName">{t("firstName")}</Label>
                    <Input
                      id="guestFirstName"
                      name="guestFirstName"
                      required
                      autoComplete="given-name"
                      value={guestFirstName}
                      onChange={(event) => setGuestFirstName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guestLastName">{t("lastName")}</Label>
                    <Input
                      id="guestLastName"
                      name="guestLastName"
                      required
                      autoComplete="family-name"
                      value={guestLastName}
                      onChange={(event) => setGuestLastName(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestPreferredLocale">
                    {t("preferredLanguage")}
                  </Label>
                  <select
                    id="guestPreferredLocale"
                    name="guestPreferredLocale"
                    required
                    value={guestPreferredLocale}
                    onChange={(event) =>
                      setGuestPreferredLocale(event.target.value)
                    }
                    className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
                  >
                    {APP_LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {LOCALE_LABELS[code]}
                      </option>
                    ))}
                  </select>
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
                      value={guestEmail}
                      onChange={(event) => setGuestEmail(event.target.value)}
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
                      value={guestPhone}
                      onChange={(event) => setGuestPhone(event.target.value)}
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
                    value={guestAddress}
                    onChange={(event) => setGuestAddress(event.target.value)}
                  />
                </div>
                {serviceFields.map((field) => (
                  <PublicCustomField key={field.id} field={field} />
                ))}
                <label className="flex items-start gap-2 text-sm leading-relaxed">
                  <input
                    type="checkbox"
                    name="privacyAccepted"
                    value="on"
                    required
                    checked={privacyAccepted}
                    onChange={(event) =>
                      setPrivacyAccepted(event.target.checked)
                    }
                    className="mt-1 size-4 rounded border-input"
                  />
                  <span>
                    {t("privacyConsent")}{" "}
                    <Link
                      href="/privacy"
                      className="text-action underline-offset-2 hover:underline"
                    >
                      {t("privacyPolicy")}
                    </Link>
                    .
                  </span>
                </label>
                {atBookingCap ? null : (
                  <Button
                    type="submit"
                    disabled={pending || linksPending}
                    className="w-full"
                  >
                    {pending
                      ? t("booking")
                      : showExistingNotice
                        ? t("bookAnyway")
                        : t("confirm")}
                  </Button>
                )}
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PublicCustomField({ field }: { field: BookingServiceFormFieldRow }) {
  const name = formFieldInputName(field.field_key);
  const label = (
    <Label htmlFor={name}>
      {field.label}
      {field.required ? " *" : ""}
    </Label>
  );
  const help = field.help_text ? (
    <p className="text-xs text-muted-foreground">{field.help_text}</p>
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
          {help}
        </span>
      </label>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <div className="space-y-2">
        {label}
        <Textarea
          id={name}
          name={name}
          rows={3}
          required={field.required}
          maxLength={2000}
        />
        {help}
      </div>
    );
  }

  if (field.field_type === "select") {
    return (
      <div className="space-y-2">
        {label}
        <select
          id={name}
          name={name}
          required={field.required}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
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
        </select>
        {help}
      </div>
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
    <div className="space-y-2">
      {label}
      <Input
        id={name}
        name={name}
        type={inputType}
        required={field.required}
        maxLength={field.field_type === "text" ? 300 : undefined}
      />
      {help}
    </div>
  );
}
