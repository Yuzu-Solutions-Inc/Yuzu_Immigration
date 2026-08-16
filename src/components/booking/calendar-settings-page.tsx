"use client";

import { ChevronLeft } from "lucide-react";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type {
  BookingAvailabilityRuleRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
} from "@/lib/booking/types";
import { BOOKING_TIMEZONES } from "@/lib/booking/timezone";

const initialState: BookingActionState = {};
const BOOKING_FORM_ID = "booking-settings";

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
      <div className="space-y-3">
        <Link
          href="/calendar"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 w-fit gap-1 text-muted-foreground",
          )}
        >
          <ChevronLeft className="size-4" />
          {t("backToCalendar")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("settingsTitle")}
          </h1>
          <div className="flex items-center gap-3">
            <Label
              htmlFor="acceptBookings"
              className="text-base font-semibold text-brand"
            >
              {t("bookingEnabled")}
            </Label>
            <Switch
              id="acceptBookings"
              form={BOOKING_FORM_ID}
              name="isEnabled"
              checked={acceptBookings}
              disabled={!canManage}
              onCheckedChange={setAcceptBookings}
            />
          </div>
        </div>
      </div>

      <SurfaceCard className="space-y-3 p-4 sm:p-5">
        <h2 className="font-heading text-base font-semibold text-brand">
          {t("bookingOptions")}
        </h2>

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          <form
            id={BOOKING_FORM_ID}
            action={saveAction}
            className="space-y-3"
          >
            <input type="hidden" name="locale" value={locale} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field density="dense">
                <FieldLabel htmlFor="timezone" density="dense">
                  {t("timezone")}
                </FieldLabel>
                <NativeSelect
                  id="timezone"
                  name="timezone"
                  density="dense"
                  defaultValue={settings?.timezone ?? "America/Toronto"}
                  disabled={!canManage}
                >
                  {BOOKING_TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field density="dense">
                <FieldLabel htmlFor="bookingWindowDays" density="dense">
                  {t("windowDays")}
                </FieldLabel>
                <Input
                  id="bookingWindowDays"
                  name="bookingWindowDays"
                  density="dense"
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={settings?.booking_window_days ?? 14}
                  disabled={!canManage}
                  required
                />
              </Field>
              <Field density="dense">
                <FieldLabel htmlFor="minNoticeHours" density="dense">
                  {t("minNotice")}
                </FieldLabel>
                <Input
                  id="minNoticeHours"
                  name="minNoticeHours"
                  density="dense"
                  type="number"
                  min={0}
                  max={168}
                  defaultValue={settings?.min_notice_hours ?? 24}
                  disabled={!canManage}
                  required
                />
              </Field>
              <Field density="dense">
                <FieldLabel htmlFor="bufferMinutes" density="dense">
                  {t("buffer")}
                </FieldLabel>
                <Input
                  id="bufferMinutes"
                  name="bufferMinutes"
                  density="dense"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={settings?.buffer_minutes ?? 0}
                  disabled={!canManage}
                  required
                />
              </Field>
            </div>
            {canManage ? (
              <Button type="submit" size="sm" disabled={savePending}>
                {savePending ? t("saving") : t("saveSettings")}
              </Button>
            ) : null}
          </form>

          <div className="border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <GoogleCalendarSettings
              locale={locale}
              configured={googleConfigured}
              connection={googleConnection}
              compact
            />
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="space-y-4 sm:p-6">
        <WeekTemplateHours locale={locale} canManage={canManage} rules={rules} />
      </SurfaceCard>
    </div>
  );
}
