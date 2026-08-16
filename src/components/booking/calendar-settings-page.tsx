"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  saveBookingSettingsAction,
  type BookingActionState,
} from "@/app/actions/booking";
import {
  StaffCalendarIntegrations,
  StaffMeetingIntegrations,
} from "@/components/booking/staff-integrations";
import { WeekTemplateHours } from "@/components/booking/week-template-hours";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type {
  BookingAvailabilityRuleRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
  MicrosoftCalendarConnectionPublic,
  ZoomConnectionPublic,
} from "@/lib/booking/types";
import type { CalendarProvider, MeetingProvider } from "@/lib/booking/integrations";
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
  microsoftConfigured,
  microsoftConnection,
  zoomConfigured,
  zoomConnection,
  calendarProvider,
  meetingProvider,
}: {
  locale: string;
  canManage: boolean;
  settings: BookingSettingsRow | null;
  rules: BookingAvailabilityRuleRow[];
  googleConfigured: boolean;
  googleConnection: GoogleCalendarConnectionPublic | null;
  microsoftConfigured: boolean;
  microsoftConnection: MicrosoftCalendarConnectionPublic | null;
  zoomConfigured: boolean;
  zoomConnection: ZoomConnectionPublic | null;
  calendarProvider: CalendarProvider | null;
  meetingProvider: MeetingProvider | null;
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
      <SurfaceCard className="space-y-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("bookingOptions")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("bookingOptionsHelp")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label
              htmlFor="acceptBookings"
              className="text-sm font-semibold text-brand"
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

        <form id={BOOKING_FORM_ID} action={saveAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <FieldGrid>
            <Field>
              <FieldLabel htmlFor="timezone">{t("timezone")}</FieldLabel>
              <NativeSelect
                id="timezone"
                name="timezone"
                defaultValue={settings?.timezone ?? "America/Toronto"}
                disabled={!canManage}
              >
                {BOOKING_TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </NativeSelect>
              <FieldHint>{t("timezoneHelp")}</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="bookingWindowDays">{t("windowDays")}</FieldLabel>
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
              <FieldHint>{t("windowDaysHelp")}</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="minNoticeHours">{t("minNotice")}</FieldLabel>
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
              <FieldHint>{t("minNoticeHelp")}</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="bufferMinutes">{t("buffer")}</FieldLabel>
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
              <FieldHint>{t("bufferHelp")}</FieldHint>
            </Field>
          </FieldGrid>
          {canManage ? (
            <Button type="submit" size="sm" disabled={savePending}>
              {savePending ? t("saving") : t("saveSettings")}
            </Button>
          ) : null}
        </form>
      </SurfaceCard>

      <SurfaceCard className="space-y-4 sm:p-6">
        <WeekTemplateHours locale={locale} canManage={canManage} rules={rules} />
      </SurfaceCard>

      <SurfaceCard className="space-y-4 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("integrationsCalendarTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("integrationsCalendarHelp")}
          </p>
        </div>
        <StaffCalendarIntegrations
          locale={locale}
          googleConfigured={googleConfigured}
          googleConnection={googleConnection}
          microsoftConfigured={microsoftConfigured}
          microsoftConnection={microsoftConnection}
          calendarProvider={calendarProvider}
        />
      </SurfaceCard>

      <SurfaceCard className="space-y-4 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("integrationsMeetingsTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("integrationsMeetingsHelp")}
          </p>
        </div>
        <StaffMeetingIntegrations
          locale={locale}
          googleConfigured={googleConfigured}
          googleConnection={googleConnection}
          microsoftConfigured={microsoftConfigured}
          microsoftConnection={microsoftConnection}
          zoomConfigured={zoomConfigured}
          zoomConnection={zoomConnection}
          meetingProvider={meetingProvider}
        />
      </SurfaceCard>
    </div>
  );
}
