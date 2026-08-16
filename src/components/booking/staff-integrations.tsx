"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  startGoogleCalendarConnectAction,
  stopUsingGoogleCalendarAction,
  stopUsingGoogleMeetAction,
  syncGoogleCalendarNowAction,
  useGoogleCalendarAction,
  useGoogleMeetAction,
} from "@/app/actions/google-calendar";
import {
  startMicrosoftCalendarConnectAction,
  stopUsingMicrosoftCalendarAction,
  stopUsingMicrosoftTeamsAction,
  syncMicrosoftCalendarNowAction,
  useMicrosoftCalendarAction,
  useMicrosoftTeamsAction,
} from "@/app/actions/microsoft-calendar";
import {
  startZoomConnectAction,
  stopUsingZoomMeetingsAction,
  useZoomMeetingsAction,
} from "@/app/actions/zoom";
import { GoogleCalendarLogo } from "@/components/brand/google-calendar-logo";
import { GoogleMeetLogo } from "@/components/brand/google-meet-logo";
import { MicrosoftTeamsLogo } from "@/components/brand/microsoft-teams-logo";
import { OutlookCalendarLogo } from "@/components/brand/outlook-calendar-logo";
import { ZoomLogo } from "@/components/brand/zoom-logo";
import { StaffIntegrationCard } from "@/components/booking/staff-integration-card";
import { Button } from "@/components/ui/button";
import type {
  GoogleCalendarConnectionPublic,
  MicrosoftCalendarConnectionPublic,
  ZoomConnectionPublic,
} from "@/lib/booking/types";
import type { CalendarProvider, MeetingProvider } from "@/lib/booking/integrations";

function ConnectButton({
  locale,
  intent,
  action,
  logo,
  label,
}: {
  locale: string;
  intent: "calendar" | "meetings";
  action: (formData: FormData) => void | Promise<void>;
  logo: ReactNode;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" size="sm" className="gap-2">
        {logo}
        {label}
      </Button>
    </form>
  );
}

export function StaffCalendarIntegrations({
  locale,
  googleConfigured,
  googleConnection,
  microsoftConfigured,
  microsoftConnection,
  calendarProvider,
}: {
  locale: string;
  googleConfigured: boolean;
  googleConnection: GoogleCalendarConnectionPublic | null;
  microsoftConfigured: boolean;
  microsoftConnection: MicrosoftCalendarConnectionPublic | null;
  calendarProvider: CalendarProvider | null;
}) {
  const t = useTranslations("calendar");
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <StaffIntegrationCard
        locale={locale}
        configured={googleConfigured}
        connection={
          googleConnection
            ? {
                email: googleConnection.google_email,
                last_synced_at: googleConnection.last_synced_at,
                is_enabled: googleConnection.is_enabled,
              }
            : null
        }
        selected={calendarProvider === "google"}
        logo={<GoogleCalendarLogo className="size-9" />}
        title={t("googleTitle")}
        description={t("googleHelp")}
        connectedAsLabel={t("googleConnectedAs")}
        unknownAccountLabel={t("googleUnknownAccount")}
        lastSyncedKey="googleLastSynced"
        notConfiguredMessage={t("googleNotConfigured")}
        syncSuccessKey="googleSynced"
        connectAction={
          <ConnectButton
            locale={locale}
            intent="calendar"
            action={startGoogleCalendarConnectAction}
            logo={<GoogleCalendarLogo className="size-4" />}
            label={t("googleConnect")}
          />
        }
        onUse={() => useGoogleCalendarAction(locale)}
        onStop={() => stopUsingGoogleCalendarAction(locale)}
        onSync={() => syncGoogleCalendarNowAction(locale)}
      />
      <StaffIntegrationCard
        locale={locale}
        configured={microsoftConfigured}
        connection={
          microsoftConnection
            ? {
                email: microsoftConnection.microsoft_email,
                last_synced_at: microsoftConnection.last_synced_at,
                is_enabled: microsoftConnection.is_enabled,
              }
            : null
        }
        selected={calendarProvider === "microsoft"}
        logo={<OutlookCalendarLogo className="size-9" />}
        title={t("microsoftTitle")}
        description={t("microsoftHelp")}
        connectedAsLabel={t("microsoftConnectedAs")}
        unknownAccountLabel={t("microsoftUnknownAccount")}
        lastSyncedKey="microsoftLastSynced"
        notConfiguredMessage={t("microsoftNotConfigured")}
        syncSuccessKey="microsoftSynced"
        connectAction={
          <ConnectButton
            locale={locale}
            intent="calendar"
            action={startMicrosoftCalendarConnectAction}
            logo={<OutlookCalendarLogo className="size-4" />}
            label={t("microsoftConnect")}
          />
        }
        onUse={() => useMicrosoftCalendarAction(locale)}
        onStop={() => stopUsingMicrosoftCalendarAction(locale)}
        onSync={() => syncMicrosoftCalendarNowAction(locale)}
      />
    </div>
  );
}

export function StaffMeetingIntegrations({
  locale,
  googleConfigured,
  googleConnection,
  microsoftConfigured,
  microsoftConnection,
  zoomConfigured,
  zoomConnection,
  meetingProvider,
}: {
  locale: string;
  googleConfigured: boolean;
  googleConnection: GoogleCalendarConnectionPublic | null;
  microsoftConfigured: boolean;
  microsoftConnection: MicrosoftCalendarConnectionPublic | null;
  zoomConfigured: boolean;
  zoomConnection: ZoomConnectionPublic | null;
  meetingProvider: MeetingProvider | null;
}) {
  const t = useTranslations("calendar");
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <StaffIntegrationCard
        locale={locale}
        configured={googleConfigured}
        connection={
          googleConnection
            ? {
                email: googleConnection.google_email,
                last_synced_at: googleConnection.last_synced_at,
                is_enabled: googleConnection.is_enabled,
              }
            : null
        }
        selected={meetingProvider === "google_meet"}
        logo={<GoogleMeetLogo className="size-9" />}
        title={t("meetTitle")}
        description={t("meetHelp")}
        connectedAsLabel={t("googleConnectedAs")}
        unknownAccountLabel={t("googleUnknownAccount")}
        lastSyncedKey="googleLastSynced"
        notConfiguredMessage={t("googleNotConfigured")}
        connectAction={
          <ConnectButton
            locale={locale}
            intent="meetings"
            action={startGoogleCalendarConnectAction}
            logo={<GoogleMeetLogo className="size-4" />}
            label={t("meetConnect")}
          />
        }
        onUse={() => useGoogleMeetAction(locale)}
        onStop={() => stopUsingGoogleMeetAction(locale)}
      />
      <StaffIntegrationCard
        locale={locale}
        configured={microsoftConfigured}
        connection={
          microsoftConnection
            ? {
                email: microsoftConnection.microsoft_email,
                last_synced_at: microsoftConnection.last_synced_at,
                is_enabled: microsoftConnection.is_enabled,
              }
            : null
        }
        selected={meetingProvider === "teams"}
        logo={<MicrosoftTeamsLogo className="size-9" />}
        title={t("teamsTitle")}
        description={t("teamsHelp")}
        connectedAsLabel={t("microsoftConnectedAs")}
        unknownAccountLabel={t("microsoftUnknownAccount")}
        lastSyncedKey="microsoftLastSynced"
        notConfiguredMessage={t("microsoftNotConfigured")}
        connectAction={
          <ConnectButton
            locale={locale}
            intent="meetings"
            action={startMicrosoftCalendarConnectAction}
            logo={<MicrosoftTeamsLogo className="size-4" />}
            label={t("teamsConnect")}
          />
        }
        onUse={() => useMicrosoftTeamsAction(locale)}
        onStop={() => stopUsingMicrosoftTeamsAction(locale)}
      />
      <StaffIntegrationCard
        locale={locale}
        configured={zoomConfigured}
        connection={
          zoomConnection
            ? {
                email: zoomConnection.zoom_email,
                last_synced_at: null,
                is_enabled: zoomConnection.is_enabled,
              }
            : null
        }
        selected={meetingProvider === "zoom"}
        logo={<ZoomLogo className="size-9" />}
        title={t("zoomTitle")}
        description={t("zoomHelp")}
        connectedAsLabel={t("zoomConnectedAs")}
        unknownAccountLabel={t("zoomUnknownAccount")}
        notConfiguredMessage={t("zoomNotConfigured")}
        connectAction={
          <ConnectButton
            locale={locale}
            intent="meetings"
            action={startZoomConnectAction}
            logo={<ZoomLogo className="size-4" />}
            label={t("zoomConnect")}
          />
        }
        onUse={() => useZoomMeetingsAction(locale)}
        onStop={() => stopUsingZoomMeetingsAction(locale)}
      />
    </div>
  );
}
