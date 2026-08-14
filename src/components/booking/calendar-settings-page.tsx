"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  regenerateBookingLinkAction,
  saveBookingSettingsAction,
  type BookingActionState,
} from "@/app/actions/booking";
import { CopyBookingLinkButton } from "@/components/booking/copy-booking-link-button";
import { GoogleCalendarSettings } from "@/components/booking/google-calendar-settings";
import { WeekTemplateHours } from "@/components/booking/week-template-hours";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [regenPending, startRegen] = useTransition();

  useEffect(() => {
    if (saveState.message === "saved") toast.success(t("settingsSaved"));
    if (saveState.error) toast.error(t(`errors.${saveState.error}`));
  }, [saveState, t]);

  return (
    <div className="space-y-6">
      <SurfaceCard className="space-y-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("bookingOptions")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("bookingOptionsHelp")}
          </p>
        </div>
        <form action={saveAction} className="space-y-5">
          <input type="hidden" name="locale" value={locale} />
          <label className="flex items-start gap-3 rounded-xl border border-border bg-canvas px-4 py-3 text-sm">
            <input
              type="checkbox"
              name="isEnabled"
              defaultChecked={settings?.is_enabled ?? true}
              disabled={!canManage}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              <span className="block font-medium text-brand">
                {t("bookingEnabled")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("bookingEnabledHelp")}
              </span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="timezone">{t("timezone")}</Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={settings?.timezone ?? "America/Toronto"}
                disabled={!canManage}
                className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                {BOOKING_TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("timezoneHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookingWindowDays">{t("windowDays")}</Label>
              <Input
                id="bookingWindowDays"
                name="bookingWindowDays"
                type="number"
                min={1}
                max={90}
                defaultValue={settings?.booking_window_days ?? 14}
                disabled={!canManage}
                required
              />
              <p className="text-xs text-muted-foreground">{t("windowDaysHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minNoticeHours">{t("minNotice")}</Label>
              <Input
                id="minNoticeHours"
                name="minNoticeHours"
                type="number"
                min={0}
                max={168}
                defaultValue={settings?.min_notice_hours ?? 24}
                disabled={!canManage}
                required
              />
              <p className="text-xs text-muted-foreground">{t("minNoticeHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bufferMinutes">{t("buffer")}</Label>
              <Input
                id="bufferMinutes"
                name="bufferMinutes"
                type="number"
                min={0}
                max={120}
                defaultValue={settings?.buffer_minutes ?? 0}
                disabled={!canManage}
                required
              />
              <p className="text-xs text-muted-foreground">{t("bufferHelp")}</p>
            </div>
          </div>
          {canManage ? (
            <Button type="submit" disabled={savePending}>
              {savePending ? t("saving") : t("saveSettings")}
            </Button>
          ) : null}
        </form>
      </SurfaceCard>

      <SurfaceCard className="space-y-4 sm:p-6">
        <WeekTemplateHours locale={locale} canManage rules={rules} />
      </SurfaceCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SurfaceCard>
          <GoogleCalendarSettings
            locale={locale}
            configured={googleConfigured}
            connection={googleConnection}
          />
        </SurfaceCard>
        <SurfaceCard className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("regenerateTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("publicLinkHelp")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyBookingLinkButton locale={locale} />
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={regenPending}
                onClick={() => {
                  if (!window.confirm(t("regenerateConfirm"))) return;
                  startRegen(async () => {
                    const result = await regenerateBookingLinkAction(locale);
                    if (result.bookingUrl) {
                      toast.success(t("linkRegenerated"));
                    } else if (result.error) {
                      toast.error(t(`errors.${result.error}`));
                    }
                  });
                }}
              >
                {t("regenerateLink")}
              </Button>
            ) : null}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
