"use client";

import { Settings2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  regenerateBookingLinkAction,
  saveBookingSettingsAction,
  type BookingActionState,
} from "@/app/actions/booking";
import { GoogleCalendarSettings } from "@/components/booking/google-calendar-settings";
import { WeekTemplateHours } from "@/components/booking/week-template-hours";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  BookingAvailabilityRuleRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
} from "@/lib/booking/types";
import { BOOKING_TIMEZONES } from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const initialState: BookingActionState = {};

export function CalendarSettingsSheet({
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
  const [open, setOpen] = useState(false);
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5",
        )}
      >
        <Settings2 className="size-4" />
        {t("settings")}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-5xl"
        showCloseButton
      >
        <SheetHeader>
          <SheetTitle>{t("settingsTitle")}</SheetTitle>
          <SheetDescription>{t("settingsSubtitle")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-8 px-4 pb-8">
          <form action={saveAction} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isEnabled"
                defaultChecked={settings?.is_enabled ?? true}
                disabled={!canManage}
                className="size-4 rounded border-input"
              />
              {t("bookingEnabled")}
            </label>
            <div className="space-y-2">
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
            <div className="grid grid-cols-2 gap-3">
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
              </div>
            </div>
            {canManage ? (
              <Button type="submit" disabled={savePending} className="w-full">
                {savePending ? t("saving") : t("saveSettings")}
              </Button>
            ) : null}
          </form>

          <WeekTemplateHours
            locale={locale}
            canManage={canManage}
            rules={rules}
          />

          <GoogleCalendarSettings
            locale={locale}
            canManage={canManage}
            configured={googleConfigured}
            connection={googleConnection}
          />

          {canManage ? (
            <section className="space-y-2 border-t border-border pt-4">
              <h3 className="font-heading text-sm font-semibold text-brand">
                {t("regenerateTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("regenerateHelp")}
              </p>
              <Button
                type="button"
                variant="outline"
                className={cn("w-full")}
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
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
