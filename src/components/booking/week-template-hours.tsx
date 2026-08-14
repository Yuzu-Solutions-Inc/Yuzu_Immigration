"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  addAvailabilityRuleAction,
  applyWeekdayHoursPresetAction,
  deleteAvailabilityRuleAction,
  type BookingActionState,
} from "@/app/actions/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BookingAvailabilityRuleRow } from "@/lib/booking/types";
import { normalizeTimeHm } from "@/lib/booking/timezone";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
/** Monday → Sunday. DB weekday still uses 0 = Sunday. */
const TEMPLATE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const initialState: BookingActionState = {};

export function WeekTemplateHours({
  locale,
  canManage,
  rules,
}: {
  locale: string;
  canManage: boolean;
  rules: BookingAvailabilityRuleRow[];
}) {
  const t = useTranslations("calendar");
  const [ruleState, ruleAction, rulePending] = useActionState(
    addAvailabilityRuleAction,
    initialState,
  );
  const [deletePending, startDelete] = useTransition();
  const [presetPending, startPreset] = useTransition();

  useEffect(() => {
    if (ruleState.message === "rule_added") toast.success(t("ruleAdded"));
    if (ruleState.error) toast.error(t(`errors.${ruleState.error}`));
  }, [ruleState, t]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-sm font-semibold text-brand">
            {t("weekTemplate")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("weekTemplateHelp")}</p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={presetPending}
            onClick={() => {
              startPreset(async () => {
                const result = await applyWeekdayHoursPresetAction(locale);
                if (result.error) toast.error(t(`errors.${result.error}`));
                else toast.success(t("presetApplied"));
              });
            }}
          >
            {presetPending ? t("saving") : t("applyWeekdayPreset")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TEMPLATE_WEEKDAYS.map((weekday) => {
          const dayRules = rules
            .filter((rule) => rule.weekday === weekday)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          return (
            <div
              key={weekday}
              className="space-y-3 rounded-xl border border-border bg-surface p-3"
            >
              <p className="font-heading text-sm font-semibold text-brand">
                {t(`weekdays.${WEEKDAY_KEYS[weekday]}`)}
              </p>
              {dayRules.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("closedDay")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {dayRules.map((rule) => (
                    <li
                      key={rule.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-2 py-1.5 text-sm"
                    >
                      <span>
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
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <form action={ruleAction} className="space-y-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="weekday" value={weekday} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      name="startTime"
                      type="time"
                      required
                      defaultValue="09:00"
                      aria-label={t("slotStart")}
                      className="h-9 px-2 text-xs"
                    />
                    <Input
                      name="endTime"
                      type="time"
                      required
                      defaultValue="12:00"
                      aria-label={t("slotEnd")}
                      className="h-9 px-2 text-xs"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={rulePending}
                  >
                    <Plus className="size-3.5" />
                    {t("addSlot")}
                  </Button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
