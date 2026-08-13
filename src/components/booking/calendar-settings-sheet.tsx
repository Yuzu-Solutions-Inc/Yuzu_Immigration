"use client";

import { Plus, Settings2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  addAvailabilityRuleAction,
  deleteAvailabilityRuleAction,
  regenerateBookingLinkAction,
  saveBookingSettingsAction,
  type BookingActionState,
} from "@/app/actions/booking";
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
} from "@/lib/booking/types";
import { BOOKING_TIMEZONES, normalizeTimeHm } from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const initialState: BookingActionState = {};

export function CalendarSettingsSheet({
  locale,
  canManage,
  settings,
  rules,
}: {
  locale: string;
  canManage: boolean;
  settings: BookingSettingsRow | null;
  rules: BookingAvailabilityRuleRow[];
}) {
  const t = useTranslations("calendar");
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(
    saveBookingSettingsAction,
    initialState,
  );
  const [ruleState, ruleAction, rulePending] = useActionState(
    addAvailabilityRuleAction,
    initialState,
  );
  const [regenPending, startRegen] = useTransition();
  const [deletePending, startDelete] = useTransition();

  useEffect(() => {
    if (saveState.message === "saved") toast.success(t("settingsSaved"));
    if (saveState.error) toast.error(t(`errors.${saveState.error}`));
  }, [saveState, t]);

  useEffect(() => {
    if (ruleState.message === "rule_added") toast.success(t("ruleAdded"));
    if (ruleState.error) toast.error(t(`errors.${ruleState.error}`));
  }, [ruleState, t]);

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
        className="w-full overflow-y-auto sm:max-w-md"
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

          <section className="space-y-3">
            <h3 className="font-heading text-sm font-semibold text-brand">
              {t("openHours")}
            </h3>
            <p className="text-xs text-muted-foreground">{t("openHoursHelp")}</p>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRules")}</p>
            ) : (
              <ul className="space-y-2">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <span>
                      {t(`weekdays.${WEEKDAYS[rule.weekday]}`)}{" "}
                      {normalizeTimeHm(rule.start_time)}–
                      {normalizeTimeHm(rule.end_time)}
                    </span>
                    {canManage ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("removeRule")}
                        disabled={deletePending}
                        onClick={() => {
                          startDelete(async () => {
                            const result = await deleteAvailabilityRuleAction(
                              rule.id,
                              locale,
                            );
                            if (result.error) {
                              toast.error(t(`errors.${result.error}`));
                            }
                          });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <form action={ruleAction} className="grid grid-cols-3 gap-2">
                <input type="hidden" name="locale" value={locale} />
                <select
                  name="weekday"
                  defaultValue="1"
                  className="h-10 rounded-xl border border-input bg-surface px-2 text-sm"
                  aria-label={t("weekday")}
                >
                  {WEEKDAYS.map((key, index) => (
                    <option key={key} value={index}>
                      {t(`weekdays.${key}`)}
                    </option>
                  ))}
                </select>
                <Input name="startTime" type="time" required defaultValue="09:00" />
                <Input name="endTime" type="time" required defaultValue="17:00" />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="col-span-3"
                  disabled={rulePending}
                >
                  <Plus className="size-4" />
                  {rulePending ? t("saving") : t("addRule")}
                </Button>
              </form>
            ) : null}
          </section>

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
