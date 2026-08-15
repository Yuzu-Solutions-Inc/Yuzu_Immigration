"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  saveBookingSettingsAction,
  type BookingActionState,
} from "@/app/actions/booking";
import { GoogleCalendarSettings } from "@/components/booking/google-calendar-settings";
import { WeekTemplateHours } from "@/components/booking/week-template-hours";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  BookingAvailabilityRuleRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
} from "@/lib/booking/types";
import { BOOKING_TIMEZONES } from "@/lib/booking/timezone";

const initialState: BookingActionState = {};

export function CalendarSettingsPage({
  locale,
  canManage,
  settings,
  rules,
  googleConfigured,
  googleConnection,
}: {
  locale: string;
  canManage: boolean;
  settings: BookingSettingsRow | null;
  rules: BookingAvailabilityRuleRow[];
  googleConfigured: boolean;
  googleConnection: GoogleCalendarConnectionPublic | null;
}) {
  const t = useTranslations("calendar");
  const [saveState, saveAction, savePending] = useActionState(
    saveBookingSettingsAction,
    initialState,
  );
  const [acceptBookings, setAcceptBookings] = useState(
    settings?.is_enabled ?? true,
  );

  useEffect(() => {
    if (saveState.message === "saved") toast.success(t("settingsSaved"));
    if (saveState.error) toast.error(t(`errors.${saveState.error}`));
  }, [saveState, t]);

  return (
    <div className="space-y-6">
      <SurfaceCard className="space-y-4 p-5 sm:p-6">
        <div className="space-y-0.5">
          <h2 className="font-heading text-base font-semibold text-brand">
            {t("bookingOptions")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("bookingOptionsHelp")}
          </p>
        </div>

        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="acceptBookings"
                className="text-sm font-medium text-brand"
              >
                {t("bookingEnabled")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("bookingEnabledHelp")}
              </p>
            </div>
            <Switch
              id="acceptBookings"
              name="isEnabled"
              checked={acceptBookings}
              disabled={!canManage}
              onCheckedChange={setAcceptBookings}
              size="sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="timezone" className="text-xs">
                {t("timezone")}
              </Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={settings?.timezone ?? "America/Toronto"}
                disabled={!canManage}
                className="h-9 w-full rounded-lg border border-input bg-surface px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                {BOOKING_TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bookingWindowDays" className="text-xs">
                {t("windowDays")}
              </Label>
              <Input
                id="bookingWindowDays"
                name="bookingWindowDays"
                type="number"
                min={1}
                max={90}
                defaultValue={settings?.booking_window_days ?? 14}
                disabled={!canManage}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minNoticeHours" className="text-xs">
                {t("minNotice")}
              </Label>
              <Input
                id="minNoticeHours"
                name="minNoticeHours"
                type="number"
                min={0}
                max={168}
                defaultValue={settings?.min_notice_hours ?? 24}
                disabled={!canManage}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="bufferMinutes" className="text-xs">
                {t("buffer")}
              </Label>
              <Input
                id="bufferMinutes"
                name="bufferMinutes"
                type="number"
                min={0}
                max={120}
                defaultValue={settings?.buffer_minutes ?? 0}
                disabled={!canManage}
                required
                className="h-9"
              />
            </div>
          </div>

          {canManage ? (
            <Button type="submit" size="sm" disabled={savePending}>
              {savePending ? t("saving") : t("saveSettings")}
            </Button>
          ) : null}
        </form>

        <div className="border-t border-border pt-4">
          <GoogleCalendarSettings
            locale={locale}
            configured={googleConfigured}
            connection={googleConnection}
            compact
          />
        </div>
      </SurfaceCard>

      <SurfaceCard className="space-y-4 sm:p-6">
        <WeekTemplateHours locale={locale} canManage={canManage} rules={rules} />
      </SurfaceCard>
    </div>
  );
}
