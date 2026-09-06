-- Additive immigration + bookings + contracts + payments schema on Yuzu Solutions Inc.
-- Finance tables (projects/invoices/payments/...) are unchanged.
-- Immigration files use file_status; Finance engagements keep project_status.
-- Do not drop tables, storage objects, or auth.users.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on schema private to postgres, service_role;

do $$ begin
  CREATE TYPE "public"."booking_appointment_status" AS ENUM('confirmed', 'cancelled', 'completed', 'no_show', 'pending_payment');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."booking_form_field_type" AS ENUM('text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'address', 'phone_contact', 'passport');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."contract_envelope_status" AS ENUM('sent', 'viewed', 'partially_signed', 'completed', 'declined', 'expired', 'voided');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."contract_signature_kind" AS ENUM('typed', 'drawn');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."contract_signer_role" AS ENUM('client', 'consultant');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."contract_signer_status" AS ENUM('pending', 'viewed', 'signed', 'declined');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."document_request_status" AS ENUM('requested', 'uploaded', 'accepted', 'rejected');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."file_status" AS ENUM('new', 'in_progress', 'stuck', 'waiting', 'submitted', 'granted', 'rejected');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."org_member_role" AS ENUM('owner', 'admin', 'member');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."participant_role" AS ENUM('principal', 'spouse', 'partner', 'dependent', 'sponsor', 'accompanying');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."partner_kind" AS ENUM('customer', 'provider', 'both');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."payment_processor" AS ENUM('square', 'stripe');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."payment_source" AS ENUM('booking', 'project');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."person_immigration_status" AS ENUM('none', 'visitor', 'student', 'worker', 'maintained', 'permanent_resident', 'canadian_citizen', 'refugee_claimant', 'protected_person', 'overstay', 'other');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."program_family" AS ENUM('study_permit', 'work_permit', 'visitor', 'pgwp', 'express_entry', 'pnp', 'family_sponsorship', 'humanitarian', 'quebec_pstq', 'quebec_family', 'quebec_temporary', 'citizenship', 'other');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."project_contract_status" AS ENUM('draft', 'pending_signature', 'completed', 'superseded');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."project_form_status" AS ENUM('todo', 'in_progress', 'ready', 'generated');
exception when duplicate_object then null;
end $$;
do $$ begin
  CREATE TYPE "public"."project_jurisdiction" AS ENUM('federal', 'quebec', 'both');
exception when duplicate_object then null;
end $$;
CREATE TABLE IF NOT EXISTS "booking_abuse_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"email_hash" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"person_id" uuid,
	"partner_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"email_lookup_hash" text,
	"guest_phone" text NOT NULL,
	"guest_address" text NOT NULL,
	"guest_preferred_locale" text,
	"privacy_accepted_at" timestamp with time zone NOT NULL,
	"status" "booking_appointment_status" DEFAULT 'confirmed' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"host_user_id" uuid NOT NULL,
	"project_id" uuid,
	"google_event_id" text,
	"microsoft_event_id" text,
	"meet_join_url" text,
	"conference_id" text,
	"manage_token_hash" text,
	"manage_token_encrypted" text,
	"form_answers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_automation_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"days_before" integer NOT NULL,
	"appointment_starts_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_availability_rules_organization_id_user_id_weekday_start_time_end_time_unique" UNIQUE("organization_id","user_id","weekday","start_time","end_time")
);

CREATE TABLE IF NOT EXISTS "booking_blocked_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_email_automation_services" (
	"automation_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "booking_email_automation_services_automation_id_service_id_unique" UNIQUE("automation_id","service_id")
);

CREATE TABLE IF NOT EXISTS "booking_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_google_busy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"summary" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_microsoft_busy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"microsoft_event_id" text NOT NULL,
	"summary" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_payment_reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"days_before" integer NOT NULL,
	"appointment_starts_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_service_email_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"days_before" integer[] DEFAULT '{1}' NOT NULL,
	"recipients" text[] NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"include_do_not_reply" boolean DEFAULT true NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_service_form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"field_type" "booking_form_field_type" DEFAULT 'text' NOT NULL,
	"options" text[] NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_service_form_fields_form_id_field_key_unique" UNIQUE("form_id","field_key")
);

CREATE TABLE IF NOT EXISTS "booking_service_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_by" uuid,
	"rate_kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_service_links_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "booking_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"urgent_price_cents" integer,
	"urgent_auto_within_days" integer,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"allow_pay_later" boolean DEFAULT false NOT NULL,
	"payment_reminder_days" integer[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"form_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "booking_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"public_token_hash" text NOT NULL,
	"public_token_encrypted" text,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"booking_window_days" integer DEFAULT 14 NOT NULL,
	"min_notice_hours" integer DEFAULT 24 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_settings_public_token_hash_unique" UNIQUE("public_token_hash"),
	CONSTRAINT "booking_settings_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "contract_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"signer_id" uuid,
	"event_type" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contract_envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"appointment_id" uuid,
	"project_id" uuid,
	"project_contract_id" uuid,
	"title" text NOT NULL,
	"filled_html" text NOT NULL,
	"filled_sha256" text NOT NULL,
	"signed_pdf_storage_path" text,
	"signed_pdf_sha256" text,
	"status" "contract_envelope_status" DEFAULT 'sent' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contract_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"role" "contract_signer_role" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text,
	"token_encrypted" text,
	"status" "contract_signer_status" DEFAULT 'pending' NOT NULL,
	"signed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"signature_kind" "contract_signature_kind",
	"signature_text" text,
	"signature_image" text,
	"ip" text,
	"user_agent" text,
	"consent_accepted_at" timestamp with time zone,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contract_template_services" (
	"template_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "contract_template_services_template_id_service_id_unique" UNIQUE("template_id","service_id")
);

CREATE TABLE IF NOT EXISTS "contract_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"require_consultant_signature" boolean DEFAULT true NOT NULL,
	"send_on_booking" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "custom_form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"schema" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customer_portal_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"access_code" text NOT NULL,
	"access_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"last_authenticated_at" timestamp with time zone,
	"google_sub" text,
	"legal_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_portal_access_person_id_unique" UNIQUE("person_id"),
	CONSTRAINT "customer_portal_access_access_code_unique" UNIQUE("access_code"),
	CONSTRAINT "customer_portal_access_access_token_unique" UNIQUE("access_token")
);

CREATE TABLE IF NOT EXISTS "private"."customer_portal_secrets" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_suppressions" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"resend_email_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "file_destruction_register" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"client_name" text NOT NULL,
	"service_summary" text,
	"file_closed_at" timestamp with time zone,
	"destroyed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destroyed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"google_email" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"channel_id" text,
	"channel_resource_id" text,
	"channel_expiration" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_connections_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "private"."google_calendar_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"sync_token" text,
	"channel_token_encrypted" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "immigration_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"docs_done" integer DEFAULT 0 NOT NULL,
	"docs_total" integer DEFAULT 0 NOT NULL,
	"docs_to_review" integer DEFAULT 0 NOT NULL,
	"form_percent" integer DEFAULT 0 NOT NULL,
	"description" text,
	"notes" text,
	"status" "file_status" DEFAULT 'new' NOT NULL,
	"status_at" date DEFAULT current_date NOT NULL,
	"submit_before" date,
	"jurisdiction" "project_jurisdiction" DEFAULT 'federal' NOT NULL,
	"program_family" "program_family" DEFAULT 'other' NOT NULL,
	"organization_program_id" uuid,
	"form_language" text DEFAULT 'en' NOT NULL,
	"custom_form_percent" integer DEFAULT 0 NOT NULL,
	"representative_user_id" uuid,
	"inbound_local_part" text NOT NULL,
	"created_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"retain_until" timestamp with time zone,
	"destroyed_at" timestamp with time zone,
	"destroyed_by" uuid,
	"destruction_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inbound_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"encryption_alg" text DEFAULT 'aes-256-gcm' NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"skip_reason" text,
	"filed_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"person_id" uuid,
	"assignment_status" text NOT NULL,
	"direction" text NOT NULL,
	"unknown_sender" boolean DEFAULT false NOT NULL,
	"resend_email_id" text,
	"from_email_lookup_hash" text,
	"from_email" text NOT NULL,
	"to_address" text NOT NULL,
	"to_local_part" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"rfc_message_id" text,
	"in_reply_to" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "microsoft_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"microsoft_email" text,
	"calendar_id" text DEFAULT 'calendar' NOT NULL,
	"channel_id" text,
	"channel_expiration" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "microsoft_calendar_connections_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "private"."microsoft_calendar_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"sync_token" text,
	"channel_token_encrypted" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "organization_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"allows_individual" boolean DEFAULT true NOT NULL,
	"allows_couple" boolean DEFAULT true NOT NULL,
	"allows_family" boolean DEFAULT true NOT NULL,
	"allows_inside_canada" boolean DEFAULT true NOT NULL,
	"allows_outside_canada" boolean DEFAULT true NOT NULL,
	"forms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_forms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"resend_email_id" text,
	"to_hash" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_emails_idempotency_key_unique" UNIQUE("idempotency_key")
);

CREATE TABLE IF NOT EXISTS "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source" "payment_source" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"description" text NOT NULL,
	"project_id" uuid,
	"person_id" uuid,
	"partner_id" uuid,
	"appointment_id" uuid,
	"created_by" uuid,
	"processor" "payment_processor" DEFAULT 'square' NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" text,
	"square_payment_link_id" text,
	"square_order_id" text,
	"square_payment_id" text,
	"square_refund_id" text,
	"stripe_account_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"checkout_url" text,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tax_percent" numeric,
	"tax_label" text,
	"tax_country" text,
	"tax_region" text,
	"sage_tax_rate_id" text,
	"sage_invoice_id" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"partner_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"email_lookup_hash" text,
	"portal_email_hash" text,
	"phone" text,
	"preferred_locale" text DEFAULT 'en' NOT NULL,
	"immigration_status" "person_immigration_status" DEFAULT 'none' NOT NULL,
	"status_expires_at" date,
	"sage_contact_id" text,
	"sage_has_main_address" boolean DEFAULT false NOT NULL,
	"sage_address_country" text,
	"sage_address_region" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "person_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"appointment_id" uuid,
	"occurred_at" timestamp with time zone,
	"status" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "portal_auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"access_hash" text NOT NULL,
	"kind" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_booking_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"appointment_id" uuid,
	"emailed_to" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_booking_invites_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "project_contract_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_contract_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"principal_person_id" uuid,
	"title" text NOT NULL,
	"version" integer NOT NULL,
	"storage_path" text NOT NULL,
	"file_sha256" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"template_id" uuid,
	"form_id" uuid,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"form_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"form_submitted_at" timestamp with time zone,
	"require_consultant_signature" boolean DEFAULT true NOT NULL,
	"status" "project_contract_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_custom_form_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_section" text,
	"questionnaire_submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_custom_form_answers_project_id_unique" UNIQUE("project_id")
);

CREATE TABLE IF NOT EXISTS "project_custom_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"schema" jsonb NOT NULL,
	"scope" text DEFAULT 'person' NOT NULL,
	"person_id" uuid,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "project_form_status" DEFAULT 'todo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"encryption_alg" text DEFAULT 'aes-256-gcm' NOT NULL,
	"uploaded_via" text DEFAULT 'portal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_document_files_request_id_unique" UNIQUE("request_id")
);

CREATE TABLE IF NOT EXISTS "project_document_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"doc_key" text NOT NULL,
	"custom_label" text,
	"request_scope" text DEFAULT 'person' NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "document_request_status" DEFAULT 'requested' NOT NULL,
	"consultant_note" text,
	"rejection_comment" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_form_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_section" text,
	"questionnaire_submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_form_answers_project_id_unique" UNIQUE("project_id")
);

CREATE TABLE IF NOT EXISTS "project_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"form_code" text NOT NULL,
	"person_id" uuid,
	"status" "project_form_status" DEFAULT 'todo' NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"generated_storage_path" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'principal' NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "file_status" NOT NULL,
	"status_at" date NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sage_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by" uuid,
	"business_id" text NOT NULL,
	"business_name" text,
	"country_id" text,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"customer_contact_type_id" text,
	"default_ledger_account_id" text,
	"default_ledger_account_name" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sage_connections_organization_id_unique" UNIQUE("organization_id")
);

CREATE TABLE IF NOT EXISTS "private"."sage_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sage_tax_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"region_code" text,
	"sage_tax_rate_id" text NOT NULL,
	"sage_tax_rate_name" text,
	"percentage" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "security_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "square_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by" uuid,
	"merchant_id" text NOT NULL,
	"location_id" text NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"business_name" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"cancel_refund_enabled" boolean DEFAULT true NOT NULL,
	"cancel_free_days_before" integer DEFAULT 10 NOT NULL,
	"cancel_min_days_before" integer DEFAULT 2 NOT NULL,
	"cancel_refund_fee_type" text DEFAULT 'percent' NOT NULL,
	"cancel_refund_fee_cents" integer DEFAULT 0 NOT NULL,
	"cancel_refund_fee_percent" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "square_connections_organization_id_unique" UNIQUE("organization_id")
);

CREATE TABLE IF NOT EXISTS "private"."square_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "staff_booking_integrations" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_provider" text,
	"meeting_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_booking_integrations_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "staff_contract_signatures" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"presign_all" boolean DEFAULT false NOT NULL,
	"signature_kind" "contract_signature_kind",
	"signature_text" text,
	"signature_image" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_contract_signatures_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "staff_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "staff_onboarding" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"skipped_steps" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_onboarding_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "stripe_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by" uuid,
	"stripe_account_id" text NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"business_name" text,
	"charges_ready" boolean DEFAULT false NOT NULL,
	"payouts_ready" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"cancel_refund_enabled" boolean DEFAULT true NOT NULL,
	"cancel_free_days_before" integer DEFAULT 10 NOT NULL,
	"cancel_min_days_before" integer DEFAULT 2 NOT NULL,
	"cancel_refund_fee_type" text DEFAULT 'percent' NOT NULL,
	"cancel_refund_fee_cents" integer DEFAULT 0 NOT NULL,
	"cancel_refund_fee_percent" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_connections_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "stripe_connections_stripe_account_id_unique" UNIQUE("stripe_account_id")
);

CREATE TABLE IF NOT EXISTS "zoom_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"zoom_email" text,
	"zoom_user_id" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zoom_connections_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);

CREATE TABLE IF NOT EXISTS "private"."zoom_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

do $$ begin
  ALTER TABLE "booking_abuse_events" ADD CONSTRAINT "booking_abuse_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_appointments" ADD CONSTRAINT "booking_appointments_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_automation_sends" ADD CONSTRAINT "booking_automation_sends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_automation_sends" ADD CONSTRAINT "booking_automation_sends_automation_id_booking_service_email_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."booking_service_email_automations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_automation_sends" ADD CONSTRAINT "booking_automation_sends_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_availability_rules" ADD CONSTRAINT "booking_availability_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_availability_rules" ADD CONSTRAINT "booking_availability_rules_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_blocked_times" ADD CONSTRAINT "booking_blocked_times_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_blocked_times" ADD CONSTRAINT "booking_blocked_times_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_blocked_times" ADD CONSTRAINT "booking_blocked_times_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_email_automation_services" ADD CONSTRAINT "booking_email_automation_services_automation_id_booking_service_email_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."booking_service_email_automations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_email_automation_services" ADD CONSTRAINT "booking_email_automation_services_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_email_automation_services" ADD CONSTRAINT "booking_email_automation_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_forms" ADD CONSTRAINT "booking_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_google_busy" ADD CONSTRAINT "booking_google_busy_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_google_busy" ADD CONSTRAINT "booking_google_busy_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_microsoft_busy" ADD CONSTRAINT "booking_microsoft_busy_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_microsoft_busy" ADD CONSTRAINT "booking_microsoft_busy_connection_id_microsoft_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."microsoft_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_payment_reminder_sends" ADD CONSTRAINT "booking_payment_reminder_sends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_payment_reminder_sends" ADD CONSTRAINT "booking_payment_reminder_sends_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_payment_reminder_sends" ADD CONSTRAINT "booking_payment_reminder_sends_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_email_automations" ADD CONSTRAINT "booking_service_email_automations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_form_fields" ADD CONSTRAINT "booking_service_form_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_form_fields" ADD CONSTRAINT "booking_service_form_fields_form_id_booking_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."booking_forms"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_links" ADD CONSTRAINT "booking_service_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_links" ADD CONSTRAINT "booking_service_links_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_links" ADD CONSTRAINT "booking_service_links_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_service_links" ADD CONSTRAINT "booking_service_links_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_form_id_booking_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."booking_forms"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_envelope_id_contract_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."contract_envelopes"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_signer_id_contract_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."contract_signers"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_envelopes" ADD CONSTRAINT "contract_envelopes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_envelopes" ADD CONSTRAINT "contract_envelopes_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_envelopes" ADD CONSTRAINT "contract_envelopes_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_envelopes" ADD CONSTRAINT "contract_envelopes_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_envelopes" ADD CONSTRAINT "contract_envelopes_project_contract_id_project_contracts_id_fk" FOREIGN KEY ("project_contract_id") REFERENCES "public"."project_contracts"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_envelope_id_contract_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."contract_envelopes"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_template_services" ADD CONSTRAINT "contract_template_services_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_template_services" ADD CONSTRAINT "contract_template_services_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_template_services" ADD CONSTRAINT "contract_template_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_form_id_booking_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."booking_forms"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "custom_form_templates" ADD CONSTRAINT "custom_form_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "custom_form_templates" ADD CONSTRAINT "custom_form_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "customer_portal_access" ADD CONSTRAINT "customer_portal_access_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "customer_portal_access" ADD CONSTRAINT "customer_portal_access_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "private"."customer_portal_secrets" ADD CONSTRAINT "customer_portal_secrets_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "file_destruction_register" ADD CONSTRAINT "file_destruction_register_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "file_destruction_register" ADD CONSTRAINT "file_destruction_register_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "file_destruction_register" ADD CONSTRAINT "file_destruction_register_destroyed_by_profiles_id_fk" FOREIGN KEY ("destroyed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "private"."google_calendar_secrets" ADD CONSTRAINT "google_calendar_secrets_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "immigration_projects" ADD CONSTRAINT "immigration_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "immigration_projects" ADD CONSTRAINT "immigration_projects_organization_program_id_organization_programs_id_fk" FOREIGN KEY ("organization_program_id") REFERENCES "public"."organization_programs"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "immigration_projects" ADD CONSTRAINT "immigration_projects_representative_user_id_profiles_id_fk" FOREIGN KEY ("representative_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "immigration_projects" ADD CONSTRAINT "immigration_projects_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "immigration_projects" ADD CONSTRAINT "immigration_projects_destroyed_by_profiles_id_fk" FOREIGN KEY ("destroyed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_attachments" ADD CONSTRAINT "inbound_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_attachments" ADD CONSTRAINT "inbound_attachments_message_id_inbound_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."inbound_messages"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_attachments" ADD CONSTRAINT "inbound_attachments_filed_request_id_project_document_requests_id_fk" FOREIGN KEY ("filed_request_id") REFERENCES "public"."project_document_requests"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "microsoft_calendar_connections" ADD CONSTRAINT "microsoft_calendar_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "microsoft_calendar_connections" ADD CONSTRAINT "microsoft_calendar_connections_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "private"."microsoft_calendar_secrets" ADD CONSTRAINT "microsoft_calendar_secrets_connection_id_microsoft_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."microsoft_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "organization_programs" ADD CONSTRAINT "organization_programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "organization_programs" ADD CONSTRAINT "organization_programs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "people" ADD CONSTRAINT "people_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "people" ADD CONSTRAINT "people_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "portal_auth_events" ADD CONSTRAINT "portal_auth_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_appointment_id_booking_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."booking_appointments"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_booking_invites" ADD CONSTRAINT "project_booking_invites_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contract_files" ADD CONSTRAINT "project_contract_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contract_files" ADD CONSTRAINT "project_contract_files_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contract_files" ADD CONSTRAINT "project_contract_files_project_contract_id_project_contracts_id_fk" FOREIGN KEY ("project_contract_id") REFERENCES "public"."project_contracts"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contract_files" ADD CONSTRAINT "project_contract_files_envelope_id_contract_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."contract_envelopes"("id") ON DELETE restrict ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contract_files" ADD CONSTRAINT "project_contract_files_principal_person_id_people_id_fk" FOREIGN KEY ("principal_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_form_id_booking_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."booking_forms"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_superseded_by_project_contracts_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."project_contracts"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_custom_form_answers" ADD CONSTRAINT "project_custom_form_answers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_custom_form_answers" ADD CONSTRAINT "project_custom_form_answers_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_custom_forms" ADD CONSTRAINT "project_custom_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_custom_forms" ADD CONSTRAINT "project_custom_forms_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_custom_forms" ADD CONSTRAINT "project_custom_forms_template_id_custom_form_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."custom_form_templates"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_custom_forms" ADD CONSTRAINT "project_custom_forms_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_files" ADD CONSTRAINT "project_document_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_files" ADD CONSTRAINT "project_document_files_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_files" ADD CONSTRAINT "project_document_files_request_id_project_document_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."project_document_requests"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_files" ADD CONSTRAINT "project_document_files_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_requests" ADD CONSTRAINT "project_document_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_requests" ADD CONSTRAINT "project_document_requests_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_requests" ADD CONSTRAINT "project_document_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_document_requests" ADD CONSTRAINT "project_document_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_form_answers" ADD CONSTRAINT "project_form_answers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_form_answers" ADD CONSTRAINT "project_form_answers_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_forms" ADD CONSTRAINT "project_forms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_forms" ADD CONSTRAINT "project_forms_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_forms" ADD CONSTRAINT "project_forms_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "sage_connections" ADD CONSTRAINT "sage_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "sage_connections" ADD CONSTRAINT "sage_connections_connected_by_profiles_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "private"."sage_secrets" ADD CONSTRAINT "sage_secrets_connection_id_sage_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."sage_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "sage_tax_mappings" ADD CONSTRAINT "sage_tax_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "square_connections" ADD CONSTRAINT "square_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "square_connections" ADD CONSTRAINT "square_connections_connected_by_profiles_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "private"."square_secrets" ADD CONSTRAINT "square_secrets_connection_id_square_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."square_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_booking_integrations" ADD CONSTRAINT "staff_booking_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_booking_integrations" ADD CONSTRAINT "staff_booking_integrations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_contract_signatures" ADD CONSTRAINT "staff_contract_signatures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_contract_signatures" ADD CONSTRAINT "staff_contract_signatures_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_project_id_immigration_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."immigration_projects"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_onboarding" ADD CONSTRAINT "staff_onboarding_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "staff_onboarding" ADD CONSTRAINT "staff_onboarding_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_connected_by_profiles_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "zoom_connections" ADD CONSTRAINT "zoom_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "zoom_connections" ADD CONSTRAINT "zoom_connections_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
do $$ begin
  ALTER TABLE "private"."zoom_secrets" ADD CONSTRAINT "zoom_secrets_connection_id_zoom_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."zoom_connections"("id") ON DELETE cascade ON UPDATE no action;
exception when duplicate_object then null;
end $$;
CREATE UNIQUE INDEX IF NOT EXISTS "booking_appointments_manage_token_hash_uidx" ON "booking_appointments" USING btree ("manage_token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "booking_automation_sends_once_uidx" ON "booking_automation_sends" USING btree ("automation_id","appointment_id","days_before","appointment_starts_at");
CREATE UNIQUE INDEX IF NOT EXISTS "booking_payment_reminder_sends_once_uidx" ON "booking_payment_reminder_sends" USING btree ("appointment_id","days_before","appointment_starts_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_square_order_uidx" ON "payment_requests" USING btree ("square_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_stripe_session_uidx" ON "payment_requests" USING btree ("stripe_checkout_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_appointment_uidx" ON "payment_requests" USING btree ("appointment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "people_partner_id_uidx" ON "people" USING btree ("partner_id");
CREATE UNIQUE INDEX IF NOT EXISTS "person_notes_appointment_id_uidx" ON "person_notes" USING btree ("appointment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "project_participants_active_unique" ON "project_participants" USING btree ("project_id","person_id") WHERE "project_participants"."left_at" is null;-- Profile representative fields (IMM 5476).
alter table public.profiles
  add column if not exists rep_family_name text,
  add column if not exists rep_given_name text,
  add column if not exists rep_organization text,
  add column if not exists rep_email text,
  add column if not exists rep_phone text,
  add column if not exists rep_phone_country_code text,
  add column if not exists rep_membership_id text,
  add column if not exists rep_street_num text,
  add column if not exists rep_street_name text,
  add column if not exists rep_city text,
  add column if not exists rep_province text,
  add column if not exists rep_country text,
  add column if not exists rep_postal_code text;

-- Inbound aliases must stay unique across orgs and files.
create or replace function public.generate_inbound_local_part(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  i int := 0;
begin
  if p_prefix not in ('o_', 'p_') then
    raise exception 'invalid inbound prefix';
  end if;
  loop
    i := i + 1;
    v_token := p_prefix || encode(extensions.gen_random_bytes(12), 'hex');
    exit when not exists (
      select 1 from public.organizations o where o.inbound_local_part = v_token
    ) and not exists (
      select 1 from public.immigration_projects p where p.inbound_local_part = v_token
    );
    if i > 24 then
      raise exception 'inbound local part collision';
    end if;
  end loop;
  return v_token;
end;
$$;

revoke all on function public.generate_inbound_local_part(text) from public, anon, authenticated;
grant execute on function public.generate_inbound_local_part(text) to service_role;

create or replace function public.immigration_projects_set_inbound_local_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inbound_local_part is null or btrim(new.inbound_local_part) = '' then
    new.inbound_local_part := public.generate_inbound_local_part('p_');
  end if;
  return new;
end;
$$;

drop trigger if exists immigration_projects_inbound_local_part_bi on public.immigration_projects;
create trigger immigration_projects_inbound_local_part_bi
  before insert on public.immigration_projects
  for each row execute function public.immigration_projects_set_inbound_local_part();

create unique index if not exists immigration_projects_inbound_local_part_uidx
  on public.immigration_projects (inbound_local_part);

alter table public.immigration_projects drop constraint if exists immigration_projects_inbound_local_part_format;
alter table public.immigration_projects
  add constraint immigration_projects_inbound_local_part_format
  check (inbound_local_part ~ '^p_[0-9a-f]{24}$');

-- Org-wide access (every member sees all org data).
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.immigration_projects p
    where p.id = p_project_id
      and public.is_org_member(p.organization_id)
  );
$$;

create or replace function public.can_access_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people pe
    where pe.id = p_person_id
      and public.is_org_member(pe.organization_id)
  );
$$;

grant execute on function public.can_access_project(uuid) to authenticated, service_role;
grant execute on function public.can_access_person(uuid) to authenticated, service_role;
revoke all on function public.can_access_project(uuid) from public, anon;
revoke all on function public.can_access_person(uuid) from public, anon;

-- Org-scoped btree lookups for list pages.
create index if not exists people_organization_id_idx on public.people (organization_id);
create index if not exists people_email_lookup_hash_idx on public.people (organization_id, email_lookup_hash);
create index if not exists immigration_projects_organization_id_idx on public.immigration_projects (organization_id);
create index if not exists immigration_projects_status_idx on public.immigration_projects (organization_id, status);
create index if not exists project_participants_project_id_idx on public.project_participants (project_id);
create index if not exists project_participants_person_id_idx on public.project_participants (person_id);
create index if not exists booking_appointments_org_starts_idx on public.booking_appointments (organization_id, starts_at);
create index if not exists booking_appointments_partner_id_idx on public.booking_appointments (partner_id);
create index if not exists payment_requests_org_status_idx on public.payment_requests (organization_id, status);
create index if not exists payment_requests_partner_id_idx on public.payment_requests (partner_id);
create index if not exists project_forms_project_id_idx on public.project_forms (project_id);
create index if not exists project_document_requests_project_id_idx on public.project_document_requests (project_id);
create index if not exists staff_notifications_user_unread_idx
  on public.staff_notifications (user_id, created_at desc)
  where read_at is null;

-- RLS: same tenant model as Finance tables on this database.
do $rls$
declare
  t text;
begin
  foreach t in array array[
    'people',
    'person_notes',
    'immigration_projects',
    'project_notes',
    'inbound_messages',
    'inbound_attachments',
    'project_status_history',
    'project_participants',
    'customer_portal_access',
    'project_forms',
    'project_form_answers',
    'project_document_requests',
    'organization_programs',
    'custom_form_templates',
    'project_custom_forms',
    'project_custom_form_answers',
    'project_document_files',
    'file_destruction_register',
    'booking_settings',
    'booking_availability_rules',
    'booking_services',
    'booking_forms',
    'booking_service_form_fields',
    'booking_service_email_automations',
    'booking_email_automation_services',
    'booking_blocked_times',
    'booking_appointments',
    'contract_templates',
    'contract_template_services',
    'project_contracts',
    'project_contract_files',
    'contract_envelopes',
    'contract_signers',
    'contract_audit_events',
    'staff_contract_signatures',
    'booking_service_links',
    'project_booking_invites',
    'booking_automation_sends',
    'booking_abuse_events',
    'google_calendar_connections',
    'square_connections',
    'stripe_connections',
    'sage_connections',
    'sage_tax_mappings',
    'payment_requests',
    'booking_payment_reminder_sends',
    'microsoft_calendar_connections',
    'zoom_connections',
    'staff_booking_integrations',
    'booking_google_busy',
    'booking_microsoft_busy',
    'staff_notifications',
    'staff_onboarding',
    'security_audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_org_member on public.%I', t, t);
    execute format(
      'create policy %I_org_member on public.%I for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))',
      t, t
    );
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('revoke all on table public.%I from anon, public', t);
  end loop;
end;
$rls$;

-- Service-role-only tables (no Data API for authenticated).
alter table public.portal_auth_events enable row level security;
alter table public.outbound_emails enable row level security;
alter table public.email_suppressions enable row level security;
revoke all on table public.portal_auth_events from public, anon, authenticated;
revoke all on table public.outbound_emails from public, anon, authenticated;
revoke all on table public.email_suppressions from public, anon, authenticated;
grant all on table public.portal_auth_events to service_role;
grant all on table public.outbound_emails to service_role;
grant all on table public.email_suppressions to service_role;

-- Private secrets: never grant to anon/authenticated.
revoke all on table private.customer_portal_secrets from public, anon, authenticated;
revoke all on table private.google_calendar_secrets from public, anon, authenticated;
revoke all on table private.microsoft_calendar_secrets from public, anon, authenticated;
revoke all on table private.sage_secrets from public, anon, authenticated;
revoke all on table private.square_secrets from public, anon, authenticated;
revoke all on table private.zoom_secrets from public, anon, authenticated;
grant all on table private.customer_portal_secrets to service_role;
grant all on table private.google_calendar_secrets to service_role;
grant all on table private.microsoft_calendar_secrets to service_role;
grant all on table private.sage_secrets to service_role;
grant all on table private.square_secrets to service_role;
grant all on table private.zoom_secrets to service_role;
alter table private.customer_portal_secrets enable row level security;
alter table private.google_calendar_secrets enable row level security;
alter table private.microsoft_calendar_secrets enable row level security;
alter table private.sage_secrets enable row level security;
alter table private.square_secrets enable row level security;
alter table private.zoom_secrets enable row level security;

-- Portal access codes + login (service_role only).
create or replace function public.generate_customer_access_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  i int := 0;
begin
  loop
    i := i + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (
      select 1 from public.customer_portal_access a where a.access_code = v_code
    );
    if i > 24 then
      raise exception 'access code collision';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.generate_customer_access_code() from public, anon, authenticated;
grant execute on function public.generate_customer_access_code() to service_role;

create or replace function public.lookup_customer_portal_access(p_access_id text)
returns public.customer_portal_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access public.customer_portal_access;
begin
  if p_access_id is null or length(trim(p_access_id)) = 0 then
    return null;
  end if;
  select a.* into v_access
  from public.customer_portal_access a
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and (
      a.access_code = upper(trim(p_access_id))
      or a.access_token::text = lower(trim(p_access_id))
    )
  limit 1;
  return v_access;
end;
$$;

revoke all on function public.lookup_customer_portal_access(text) from public, anon, authenticated;
grant execute on function public.lookup_customer_portal_access(text) to service_role;

create or replace function public.customer_portal_password_exists(p_access_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access public.customer_portal_access;
begin
  v_access := public.lookup_customer_portal_access(p_access_id);
  if v_access.id is null then
    return false;
  end if;
  return exists (
    select 1 from private.customer_portal_secrets s where s.person_id = v_access.person_id
  );
end;
$$;

revoke all on function public.customer_portal_password_exists(text) from public, anon, authenticated;
grant execute on function public.customer_portal_password_exists(text) to service_role;

create or replace function public.verify_customer_portal_login(p_access_id text, p_password text)
returns table (
  customer_id uuid,
  organization_id uuid,
  access_token uuid,
  access_code text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_access public.customer_portal_access;
  v_hash text;
begin
  v_access := public.lookup_customer_portal_access(p_access_id);
  if v_access.id is null then
    return;
  end if;
  select s.password_hash into v_hash
  from private.customer_portal_secrets s
  where s.person_id = v_access.person_id;
  if v_hash is null or v_hash <> extensions.crypt(p_password, v_hash) then
    return;
  end if;
  update public.customer_portal_access
  set last_authenticated_at = now(), updated_at = now()
  where id = v_access.id;
  customer_id := v_access.person_id;
  organization_id := v_access.organization_id;
  access_token := v_access.access_token;
  access_code := v_access.access_code;
  return next;
end;
$$;

revoke all on function public.verify_customer_portal_login(text, text) from public, anon, authenticated;
grant execute on function public.verify_customer_portal_login(text, text) to service_role;

create or replace function public.client_set_customer_portal_password(p_access_id text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_access public.customer_portal_access;
begin
  if p_password is null
     or char_length(p_password) < 8
     or p_password !~ '[A-Z]'
     or p_password !~ '[0-9]'
     or p_password !~ '[^A-Za-z0-9]'
  then
    raise exception 'invalid_password';
  end if;
  v_access := public.lookup_customer_portal_access(p_access_id);
  if v_access.id is null then
    return false;
  end if;
  if exists (
    select 1 from private.customer_portal_secrets s where s.person_id = v_access.person_id
  ) then
    raise exception 'password_already_set';
  end if;
  insert into private.customer_portal_secrets (person_id, password_hash)
  values (v_access.person_id, extensions.crypt(p_password, extensions.gen_salt('bf', 12)));
  update public.customer_portal_access
  set last_authenticated_at = now(), updated_at = now()
  where id = v_access.id;
  return true;
end;
$$;

revoke all on function public.client_set_customer_portal_password(text, text) from public, anon, authenticated;
grant execute on function public.client_set_customer_portal_password(text, text) to service_role;

create or replace function public.set_customer_portal_password(
  p_customer_id uuid,
  p_password text,
  p_actor_user_id uuid
)
returns public.customer_portal_access
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  if p_password is null or char_length(p_password) < 10 then
    raise exception 'Password must be at least 10 characters';
  end if;
  select * into v_person from public.people p where p.id = p_customer_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
  ) then
    raise exception 'Not authorized';
  end if;
  insert into public.customer_portal_access (person_id, organization_id, access_code, is_active)
  values (v_person.id, v_person.organization_id, public.generate_customer_access_code(), true)
  on conflict (person_id) do update
    set is_active = true, updated_at = now()
  returning * into v_access;
  insert into private.customer_portal_secrets (person_id, password_hash)
  values (v_person.id, extensions.crypt(p_password, extensions.gen_salt('bf', 12)))
  on conflict (person_id) do update
    set password_hash = excluded.password_hash, updated_at = now();
  return v_access;
end;
$$;

create or replace function public.enable_customer_portal(p_person_id uuid, p_actor_user_id uuid)
returns public.customer_portal_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  select * into v_person from public.people p where p.id = p_person_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
  ) then
    raise exception 'Not authorized';
  end if;
  insert into public.customer_portal_access (person_id, organization_id, access_code, is_active)
  values (v_person.id, v_person.organization_id, public.generate_customer_access_code(), true)
  on conflict (person_id) do update
    set is_active = true, updated_at = now()
  returning * into v_access;
  return v_access;
end;
$$;

create or replace function public.set_customer_portal_active(
  p_person_id uuid,
  p_actor_user_id uuid,
  p_is_active boolean
)
returns public.customer_portal_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  select * into v_person from public.people p where p.id = p_person_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
  ) then
    raise exception 'Not authorized';
  end if;
  update public.customer_portal_access
  set is_active = p_is_active, updated_at = now()
  where person_id = p_person_id
  returning * into v_access;
  if v_access.id is null then
    raise exception 'Portal access not found';
  end if;
  return v_access;
end;
$$;

create or replace function public.staff_reset_customer_portal(p_person_id uuid, p_actor_user_id uuid)
returns public.customer_portal_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  select * into v_person from public.people p where p.id = p_person_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
  ) then
    raise exception 'Not authorized';
  end if;
  select * into v_access from public.customer_portal_access a where a.person_id = p_person_id;
  if v_access.id is null then
    raise exception 'Portal access not found';
  end if;
  update public.customer_portal_access
  set access_token = gen_random_uuid(), is_active = true, updated_at = now()
  where id = v_access.id
  returning * into v_access;
  delete from private.customer_portal_secrets where person_id = v_access.person_id;
  return v_access;
end;
$$;

revoke all on function public.set_customer_portal_password(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.enable_customer_portal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_customer_portal_active(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.staff_reset_customer_portal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_customer_portal_password(uuid, text, uuid) to service_role;
grant execute on function public.enable_customer_portal(uuid, uuid) to service_role;
grant execute on function public.set_customer_portal_active(uuid, uuid, boolean) to service_role;
grant execute on function public.staff_reset_customer_portal(uuid, uuid) to service_role;

-- Encrypted client documents (path: orgId/projectId/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  10485760,
  array['application/octet-stream']::text[]
)
on conflict (id) do nothing;

drop policy if exists client_documents_select_access on storage.objects;
drop policy if exists client_documents_insert_access on storage.objects;
drop policy if exists client_documents_update_access on storage.objects;
drop policy if exists client_documents_delete_access on storage.objects;

create policy client_documents_select_access
  on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and public.can_access_document_path(name));

create policy client_documents_insert_access
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and public.can_access_document_path(name));

create policy client_documents_update_access
  on storage.objects for update to authenticated
  using (bucket_id = 'client-documents' and public.can_access_document_path(name))
  with check (bucket_id = 'client-documents' and public.can_access_document_path(name));

create policy client_documents_delete_access
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents' and public.can_access_document_path(name));
