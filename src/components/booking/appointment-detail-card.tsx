"use client";

import { CalendarClock, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  listAppointmentRescheduleSlotsAction,
  rescheduleAppointmentAction,
  type RescheduleSlotOption,
} from "@/app/actions/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatPriceCents } from "@/lib/booking/slots";
import type {
  BookingAppointmentRow,
  BookingServiceFormFieldRow,
} from "@/lib/booking/types";
import {
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  zonedCivilToUtc,
} from "@/lib/booking/timezone";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { cn } from "@/lib/utils";

export function AppointmentDetailCard({
  locale,
  canManage,
  pending,
  timeZone,
  row,
  formFields,
  hostNames,
  onCancel,
  onRescheduled,
}: {
  locale: string;
  canManage: boolean;
  pending: boolean;
  timeZone: string;
  row: BookingAppointmentRow;
  formFields: BookingServiceFormFieldRow[];
  hostNames: Record<string, string>;
  onCancel: (id: string) => void;
  onRescheduled: (dateIso: string) => void;
}) {
  const t = useTranslations("calendar");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [slots, setSlots] = useState<RescheduleSlotOption[] | null>(null);
  const [slotsPending, startSlots] = useTransition();
  const [savePending, startSave] = useTransition();
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);

  useEffect(() => {
    setRescheduleOpen(false);
    setDetailsOpen(false);
    setSlots(null);
    setDateIso(null);
    setSlotStart(null);
  }, [row.id]);

  const formEntries = Object.entries(row.form_answers ?? {});
  const hasExtraDetails =
    Boolean(row.guest_address?.trim()) ||
    formEntries.length > 0 ||
    Boolean(row.person_id);

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

  function openReschedule() {
    setRescheduleOpen(true);
    startSlots(async () => {
      const result = await listAppointmentRescheduleSlotsAction(row.id);
      if (result.error && !result.slots) {
        toast.error(t(`errors.${result.error}`));
        setRescheduleOpen(false);
        return;
      }
      const next = result.slots ?? [];
      setSlots(next);
      const firstDay = next[0]?.dateIso ?? null;
      setDateIso(firstDay);
      setSlotStart(null);
    });
  }

  function saveReschedule() {
    if (!selectedSlot) return;
    startSave(async () => {
      const result = await rescheduleAppointmentAction({
        appointmentId: row.id,
        locale,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
      });
      if (result.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("rescheduled"));
      setRescheduleOpen(false);
      onRescheduled(selectedSlot.dateIso);
    });
  }

  const busy = pending || slotsPending || savePending;

  return (
    <div className="rounded-xl border border-border bg-canvas/50 shadow-sm">
      <div className="space-y-3 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-heading text-base font-semibold text-brand">
              {row.guest_name}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {row.service
                ? serviceTitle(row.service, locale)
                : t("unknownService")}
              {row.service
                ? ` · ${formatPriceCents(row.service.price_cents, locale, row.service.currency)}`
                : null}
            </p>
          </div>
          <Badge
            variant={row.status === "confirmed" ? "default" : "secondary"}
            className="shrink-0"
          >
            {t(`status.${row.status}`)}
          </Badge>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
          <p className="text-sm font-medium text-brand">
            {formatDateTimeInZone(new Date(row.starts_at), timeZone, locale)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatTimeInZone(new Date(row.starts_at), timeZone, locale)}
            {" – "}
            {formatTimeInZone(new Date(row.ends_at), timeZone, locale)}
            {hostNames[row.host_user_id]
              ? ` · ${t("hostedBy", { name: hostNames[row.host_user_id] })}`
              : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{row.guest_email}</span>
          {row.guest_phone ? (
            <>
              <span className="text-border" aria-hidden>
                ·
              </span>
              <span className="truncate">{row.guest_phone}</span>
            </>
          ) : null}
          {row.meet_join_url?.startsWith("https://") ? (
            <>
              <span className="text-border" aria-hidden>
                ·
              </span>
              <a
                href={row.meet_join_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-action hover:underline"
              >
                {t("joinMeet")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          ) : null}
        </div>

        {hasExtraDetails ? (
          <div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-brand"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? t("hideDetails") : t("moreDetails")}
              {detailsOpen ? (
                <ChevronUp className="size-3.5" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden />
              )}
            </button>
            {detailsOpen ? (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-surface px-2.5 py-2 text-xs text-muted-foreground">
                {row.guest_address?.trim() ? (
                  <p>{row.guest_address}</p>
                ) : null}
                {formEntries.map(([key, value]) => {
                  const field = formFields.find(
                    (item) =>
                      item.form_id === row.service?.form_id &&
                      item.field_key === key,
                  );
                  const display =
                    field?.field_type === "checkbox"
                      ? value === "true"
                        ? t("formYes")
                        : t("formNo")
                      : value;
                  return (
                    <p key={key}>
                      <span className="font-medium text-brand/80">
                        {field?.label ?? key}:
                      </span>{" "}
                      {display}
                    </p>
                  );
                })}
                {row.person_id ? (
                  <Link
                    href={`/people/${row.person_id}`}
                    className="inline-flex font-medium text-action hover:underline"
                  >
                    {t("openPerson")}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {canManage && row.status === "confirmed" && !rescheduleOpen ? (
          <div className="flex flex-wrap gap-2 border-t border-border/80 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={openReschedule}
            >
              <CalendarClock className="size-4" />
              {t("changeTime")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("cancelConfirm"))) return;
                onCancel(row.id);
              }}
            >
              {t("cancelAppointment")}
            </Button>
          </div>
        ) : null}
      </div>

      {rescheduleOpen ? (
        <div className="border-t border-border bg-surface px-3.5 py-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-brand">
                {t("changeTimeTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("changeTimeHelp")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={t("rescheduleBack")}
              onClick={() => setRescheduleOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          {slotsPending && !slots ? (
            <p className="text-xs text-muted-foreground">{t("saving")}</p>
          ) : !slots || slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("noRescheduleSlots")}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {availableDays.map((day) => {
                  const noon = zonedCivilToUtc(day, "12:00", timeZone);
                  const selected = day === dateIso;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={busy}
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
                      {formatDateInZone(noon, timeZone, locale)}
                    </button>
                  );
                })}
              </div>

              {daySlots.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("noRescheduleSlotsDay")}
                </p>
              ) : (
                <div className="grid max-h-28 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
                  {daySlots.map((slot) => {
                    const selected = slot.startsAt === slotStart;
                    return (
                      <button
                        key={slot.startsAt}
                        type="button"
                        disabled={busy}
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
                          timeZone,
                          locale,
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !selectedSlot}
                  onClick={saveReschedule}
                >
                  {savePending ? t("saving") : t("saveNewTime")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setRescheduleOpen(false)}
                >
                  {t("rescheduleBack")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
