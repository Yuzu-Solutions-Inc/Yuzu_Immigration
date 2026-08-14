"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  sendProjectCallInviteAction,
  type ScheduleCallActionState,
} from "@/app/actions/project-call-invite";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import type {
  ProjectInviteHistoryItem,
  ProjectMeetingHistoryItem,
} from "@/lib/booking/queries";
import { formatDateTimeInZone } from "@/lib/booking/timezone";

const initialState: ScheduleCallActionState = {};

export function ProjectScheduleCallCard({
  locale,
  projectId,
  timezone,
  canSchedule,
  principalEmail,
  meetings,
  invites,
}: {
  locale: string;
  projectId: string;
  timezone: string;
  canSchedule: boolean;
  principalEmail: string | null;
  meetings: ProjectMeetingHistoryItem[];
  invites: ProjectInviteHistoryItem[];
}) {
  const t = useTranslations("projectCall");
  const [state, action, pending] = useActionState(
    sendProjectCallInviteAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "sent") {
      toast.success(t("sent"));
    }
  }, [state.message, t]);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        unauthorized: t("errors.unauthorized"),
        not_found: t("errors.notFound"),
        booking_not_configured: t("errors.bookingNotConfigured"),
        no_principal: t("errors.noPrincipal"),
        no_email: t("errors.noEmail"),
        no_availability: t("errors.noAvailability"),
        service_failed: t("errors.serviceFailed"),
        send_failed: t("errors.sendFailed"),
        email_failed: t("errors.emailFailed"),
      }[state.error] ?? t("errors.sendFailed")
    : null;

  return (
    <SurfaceCard className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {principalEmail
              ? t("subtitleWithEmail", { email: principalEmail })
              : t("subtitleNoEmail")}
          </p>
        </div>
        {canSchedule ? (
          <form action={action}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="projectId" value={projectId} />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !principalEmail}
            >
              {pending ? t("sending") : t("schedule")}
            </Button>
          </form>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("history")}
        </p>
        {meetings.length === 0 && invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {meetings.map((meeting) => (
              <li
                key={`m-${meeting.id}`}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand">
                    {formatDateTimeInZone(
                      new Date(meeting.startsAt),
                      timezone,
                      locale,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {meeting.hostName}
                    {" · "}
                    {t(`statuses.${meeting.status}`)}
                  </p>
                </div>
                {meeting.meetJoinUrl?.startsWith("https://") ? (
                  <a
                    href={meeting.meetJoinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-action hover:underline"
                  >
                    {t("meet")}
                  </a>
                ) : null}
              </li>
            ))}
            {invites
              .filter((invite) => invite.status === "open")
              .map((invite) => (
                <li
                  key={`i-${invite.id}`}
                  className="flex items-start justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand">
                      {t("invitePending")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {invite.emailedTo ?? invite.hostName}
                      {" · "}
                      {t("inviteExpires", {
                        date: new Date(invite.expiresAt).toLocaleDateString(
                          locale === "fr"
                            ? "fr-CA"
                            : locale === "es"
                              ? "es-ES"
                              : "en-CA",
                          { month: "short", day: "numeric" },
                        ),
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tracking-wide text-warning-text uppercase">
                    {t("inviteOpen")}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </SurfaceCard>
  );
}
