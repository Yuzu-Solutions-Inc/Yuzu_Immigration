import type { BookingAppointmentStatus } from "@/db/schema";

export type BookingSettingsRow = {
  id: string;
  organization_id: string;
  public_token_hash: string;
  public_token_encrypted: string | null;
  timezone: string;
  booking_window_days: number;
  min_notice_hours: number;
  buffer_minutes: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type BookingServiceRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BookingAvailabilityRuleRow = {
  id: string;
  organization_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  created_at: string;
};

export type BookingBlockedTimeRow = {
  id: string;
  organization_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type BookingAppointmentRow = {
  id: string;
  organization_id: string;
  service_id: string;
  person_id: string | null;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_address: string;
  privacy_accepted_at: string;
  status: BookingAppointmentStatus;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
  service?: BookingServiceRow | null;
};
