import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgMemberRoleEnum = pgEnum("org_member_role", [
  "admin",
  "case_manager",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "new",
  "in_progress",
  "stuck",
  "waiting",
  "submitted",
  "granted",
  "rejected",
]);

export const projectJurisdictionEnum = pgEnum("project_jurisdiction", [
  "federal",
  "quebec",
  "both",
]);

export const programFamilyEnum = pgEnum("program_family", [
  "study_permit",
  "work_permit",
  "visitor",
  "pgwp",
  "express_entry",
  "pnp",
  "family_sponsorship",
  "humanitarian",
  "quebec_pstq",
  "quebec_family",
  "quebec_temporary",
  "other",
]);

export const participantRoleEnum = pgEnum("participant_role", [
  "principal",
  "spouse",
  "partner",
  "dependent",
  "sponsor",
  "accompanying",
]);

export const personImmigrationStatusEnum = pgEnum("person_immigration_status", [
  "none",
  "visitor",
  "student",
  "worker",
  "maintained",
  "permanent_resident",
  "canadian_citizen",
  "refugee_claimant",
  "protected_person",
  "overstay",
  "other",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Firm default language for client-facing copy such as booking reminders. */
  defaultLocale: text("default_locale").notNull().default("en"),
  /** Org AES key wrapped with DOCUMENT_ENCRYPTION_KEY. Never store plaintext. */
  wrappedDek: text("wrapped_dek"),
  /** Legal/security inbox for client portal deletion requests. */
  privacyContactEmail: text("privacy_contact_email"),
  /** When true, clients can sign in to the portal with a verified Google account. */
  portalGoogleLoginEnabled: boolean("portal_google_login_enabled")
    .default(false)
    .notNull(),
  /** In-product Firm DPA clickwrap (Law 25 written contract). */
  dpaAcceptedAt: timestamp("dpa_accepted_at", { withTimezone: true }),
  dpaVersion: text("dpa_version"),
  dpaAcceptedBy: uuid("dpa_accepted_by"),
  /** Opaque Resend receiving local-part for unmatched firm mail. */
  inboundLocalPart: text("inbound_local_part").notNull(),
  /** Start of the 30-day Standard trial. */
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** When paid billing began. Null = still on trial / locked after trial. */
  subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Staff user profile — 1:1 with auth.users (email/password or Google). */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
  preferredLocale: text("preferred_locale").default("en").notNull(),
  avatarUrl: text("avatar_url"),
  /** IMM 5476 representative block — per staff account. */
  repFamilyName: text("rep_family_name"),
  repGivenName: text("rep_given_name"),
  repOrganization: text("rep_organization"),
  repEmail: text("rep_email"),
  repPhone: text("rep_phone"),
  repPhoneCountryCode: text("rep_phone_country_code"),
  repMembershipId: text("rep_membership_id"),
  repStreetNum: text("rep_street_num"),
  repStreetName: text("rep_street_name"),
  repCity: text("rep_city"),
  repProvince: text("rep_province"),
  repCountry: text("rep_country"),
  repPostalCode: text("rep_postal_code"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** When set, skip Permit OS trial sequence emails for this staff user. */
  trialEmailUnsubscribedAt: timestamp("trial_email_unsubscribed_at", {
    withTimezone: true,
  }),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: orgMemberRoleEnum("role").notNull().default("case_manager"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

/** Admin-issued staff invites (hashed token). */
export const organizationInvitations = pgTable("organization_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: orgMemberRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedUserId: uuid("accepted_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Lifelong immigration clients belonging to an organization. */
export const people = pgTable("people", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  /** HMAC of normalized email; used for exact lookup without decrypting the org. */
  emailLookupHash: text("email_lookup_hash"),
  /** Platform HMAC of normalized email for portal signup whitelist (same email can match many orgs). */
  portalEmailHash: text("portal_email_hash"),
  phone: text("phone"),
  preferredLocale: text("preferred_locale").default("en").notNull(),
  immigrationStatus: personImmigrationStatusEnum("immigration_status")
    .notNull()
    .default("none"),
  statusExpiresAt: date("status_expires_at"),
  sageContactId: text("sage_contact_id"),
  sageHasMainAddress: boolean("sage_has_main_address").notNull().default(false),
  sageAddressCountry: text("sage_address_country"),
  sageAddressRegion: text("sage_address_region"),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Internal consultation notes for a person (firm-only). */
export const personNotes = pgTable(
  "person_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    appointmentId: uuid("appointment_id").references(
      (): AnyPgColumn => bookingAppointments.id,
      { onDelete: "set null" },
    ),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    status: text("status").$type<BookingAppointmentStatus>(),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("person_notes_appointment_id_uidx").on(table.appointmentId),
  ],
);

export const immigrationProjects = pgTable("immigration_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  docsDone: integer("docs_done").notNull().default(0),
  docsTotal: integer("docs_total").notNull().default(0),
  docsToReview: integer("docs_to_review").notNull().default(0),
  formPercent: integer("form_percent").notNull().default(0),
  description: text("description"),
  notes: text("notes"),
  status: projectStatusEnum("status").notNull().default("new"),
  statusAt: date("status_at").notNull().default(sql`current_date`),
  submitBefore: date("submit_before"),
  jurisdiction: projectJurisdictionEnum("jurisdiction")
    .notNull()
    .default("federal"),
  programFamily: programFamilyEnum("program_family").notNull().default("other"),
  /**
   * Optional firm-defined program template used at create time.
   * Template edits do not mutate forms/docs already on this project.
   */
  organizationProgramId: uuid("organization_program_id").references(
    (): AnyPgColumn => organizationPrograms.id,
    { onDelete: "set null" },
  ),
  /** IRCC PDF blank language: en or fr. */
  formLanguage: text("form_language").notNull().default("en"),
  representativeUserId: uuid("representative_user_id").references(
    () => profiles.id,
    { onDelete: "set null" },
  ),
  /** Opaque Resend receiving local-part for this file. */
  inboundLocalPart: text("inbound_local_part").notNull(),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  retainUntil: timestamp("retain_until", { withTimezone: true }),
  destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  destroyedBy: uuid("destroyed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  destructionNote: text("destruction_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Internal consultation notes for a project file (firm-only). */
export const projectNotes = pgTable("project_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const inboundMessages = pgTable("inbound_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => immigrationProjects.id, {
    onDelete: "cascade",
  }),
  personId: uuid("person_id").references(() => people.id, {
    onDelete: "set null",
  }),
  assignmentStatus: text("assignment_status")
    .$type<"project" | "person" | "unassigned">()
    .notNull(),
  direction: text("direction").$type<"inbound" | "outbound">().notNull(),
  unknownSender: boolean("unknown_sender").notNull().default(false),
  resendEmailId: text("resend_email_id"),
  fromEmailLookupHash: text("from_email_lookup_hash"),
  fromEmail: text("from_email").notNull(),
  toAddress: text("to_address").notNull(),
  toLocalPart: text("to_local_part").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  rfcMessageId: text("rfc_message_id"),
  inReplyTo: text("in_reply_to"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const inboundAttachments = pgTable("inbound_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .references(() => inboundMessages.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  storagePath: text("storage_path").notNull(),
  encryptionAlg: text("encryption_alg").notNull().default("aes-256-gcm"),
  skipped: boolean("skipped").notNull().default(false),
  skipReason: text("skip_reason"),
  filedRequestId: uuid("filed_request_id").references(
    (): AnyPgColumn => projectDocumentRequests.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projectStatusHistory = pgTable("project_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" }),
  status: projectStatusEnum("status").notNull(),
  statusAt: date("status_at").notNull(),
  changedBy: uuid("changed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projectParticipants = pgTable(
  "project_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => immigrationProjects.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: participantRoleEnum("role").notNull().default("principal"),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("project_participants_active_unique")
      .on(table.projectId, table.personId)
      .where(sql`${table.leftAt} is null`),
  ],
);

/**
 * Portal login metadata (no password hash).
 * One row per person (hence per org). Clients sign up at /portal with a
 * whitelisted email; leftover magic links still work at /portal/[access_token].
 */
export const customerPortalAccess = pgTable("customer_portal_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  personId: uuid("person_id")
    .notNull()
    .unique()
    .references(() => people.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  accessCode: text("access_code").notNull().unique(),
  accessToken: uuid("access_token").defaultRandom().notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastAuthenticatedAt: timestamp("last_authenticated_at", {
    withTimezone: true,
  }),
  /** Google subject linked to this portal account. Unique per organization. */
  googleSub: text("google_sub"),
  legalAcceptedAt: timestamp("legal_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projectFormStatusEnum = pgEnum("project_form_status", [
  "todo",
  "in_progress",
  "ready",
  "generated",
]);

export const projectForms = pgTable(
  "project_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => immigrationProjects.id, { onDelete: "cascade" }),
    formCode: text("form_code").notNull(),
    /** Set for person-scoped forms; null for project-scoped (checklists, IMM 5409). */
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    status: projectFormStatusEnum("status").notNull().default("todo"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    generatedStoragePath: text("generated_storage_path"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const projectFormAnswers = pgTable("project_form_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" })
    .unique(),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
  currentSection: text("current_section"),
  questionnaireSubmittedAt: timestamp("questionnaire_submitted_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const documentRequestStatusEnum = pgEnum("document_request_status", [
  "requested",
  "uploaded",
  "accepted",
  "rejected",
]);

/** Per-person document checklist (passport/photo defaults + custom). */
export const projectDocumentRequests = pgTable("project_document_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  docKey: text("doc_key").notNull(),
  customLabel: text("custom_label"),
  /** person = per participant; project = one for the file (person_id = principal). */
  requestScope: text("request_scope").notNull().default("person"),
  isRequired: boolean("is_required").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  status: documentRequestStatusEnum("status").notNull().default("requested"),
  consultantNote: text("consultant_note"),
  rejectionComment: text("rejection_comment"),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Firm-defined program templates available in the New Project dropdown.
 * Forms/documents are snapshotted onto projects at create time.
 */
export const organizationPrograms = pgTable("organization_programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  allowsIndividual: boolean("allows_individual").notNull().default(true),
  allowsCouple: boolean("allows_couple").notNull().default(true),
  allowsFamily: boolean("allows_family").notNull().default(true),
  allowsInsideCanada: boolean("allows_inside_canada").notNull().default(true),
  allowsOutsideCanada: boolean("allows_outside_canada").notNull().default(true),
  forms: jsonb("forms")
    .$type<
      Array<{
        formCode: string;
        isRequired: boolean;
        sortOrder: number;
      }>
    >()
    .notNull()
    .default([]),
  documents: jsonb("documents")
    .$type<
      Array<{
        docKey: "passport" | "photo" | "custom";
        customLabel?: string | null;
        scope: "person" | "project";
        isRequired: boolean;
        sortOrder: number;
      }>
    >()
    .notNull()
    .default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Encrypted file metadata — ciphertext lives in private Storage. */
export const projectDocumentFiles = pgTable("project_document_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => projectDocumentRequests.id, { onDelete: "cascade" })
    .unique(),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  originalFilename: text("original_filename").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  encryptionAlg: text("encryption_alg").notNull().default("aes-256-gcm"),
  uploadedVia: text("uploaded_via").notNull().default("portal"), // portal | staff | email
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Append-only security audit trail (service_role inserts; admin select). */
export const securityAuditEvents = pgTable("security_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  actorUserId: uuid("actor_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  actorKind: text("actor_kind").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** CICC-oriented register of securely destroyed closed files. */
export const fileDestructionRegister = pgTable("file_destruction_register", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => immigrationProjects.id, {
    onDelete: "set null",
  }),
  clientName: text("client_name").notNull(),
  serviceSummary: text("service_summary"),
  fileClosedAt: timestamp("file_closed_at", { withTimezone: true }),
  destroyedAt: timestamp("destroyed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  destroyedBy: uuid("destroyed_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingAppointmentStatusEnum = pgEnum("booking_appointment_status", [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "pending_payment",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
]);

export const paymentSourceEnum = pgEnum("payment_source", [
  "booking",
  "project",
]);

export const bookingFormFieldTypeEnum = pgEnum("booking_form_field_type", [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "checkbox",
  "address",
  "phone_contact",
  "passport",
]);

export const contractEnvelopeStatusEnum = pgEnum("contract_envelope_status", [
  "sent",
  "viewed",
  "partially_signed",
  "completed",
  "declined",
  "expired",
  "voided",
]);

export const contractSignerRoleEnum = pgEnum("contract_signer_role", [
  "client",
  "consultant",
]);

export const contractSignerStatusEnum = pgEnum("contract_signer_status", [
  "pending",
  "viewed",
  "signed",
  "declined",
]);

export const contractSignatureKindEnum = pgEnum("contract_signature_kind", [
  "typed",
  "drawn",
]);

/** Per-org public booking page (hashed token + encrypted plaintext for recopy). */
export const bookingSettings = pgTable("booking_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  publicTokenHash: text("public_token_hash").notNull().unique(),
  publicTokenEncrypted: text("public_token_encrypted"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  bookingWindowDays: integer("booking_window_days").notNull().default(14),
  minNoticeHours: integer("min_notice_hours").notNull().default(24),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  defaultHostUserId: uuid("default_host_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Recurring weekly open hours. weekday 0 = Sunday (JS getDay). */
export const bookingAvailabilityRules = pgTable(
  "booking_availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique().on(
      table.organizationId,
      table.userId,
      table.weekday,
      table.startTime,
      table.endTime,
    ),
  ],
);

export const bookingServices = pgTable("booking_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  translations: jsonb("translations").notNull().default({}),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  urgentPriceCents: integer("urgent_price_cents"),
  urgentAutoWithinDays: integer("urgent_auto_within_days"),
  currency: text("currency").notNull().default("CAD"),
  isActive: boolean("is_active").notNull().default(true),
  allowPayLater: boolean("allow_pay_later").notNull().default(false),
  paymentReminderDays: integer("payment_reminder_days")
    .array()
    .notNull()
    .default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  formId: uuid("form_id").references(() => bookingForms.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingForms = pgTable("booking_forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingServiceFormFields = pgTable(
  "booking_service_form_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => bookingForms.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    helpText: text("help_text"),
    fieldType: bookingFormFieldTypeEnum("field_type").notNull().default("text"),
    options: text("options").array().notNull(),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.formId, table.fieldKey)],
);

export const bookingServiceEmailAutomations = pgTable(
  "booking_service_email_automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    daysBefore: integer("days_before").array().notNull().default([1]),
    recipients: text("recipients").array().notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    includeDoNotReply: boolean("include_do_not_reply").notNull().default(true),
    translations: jsonb("translations").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const bookingEmailAutomationServices = pgTable(
  "booking_email_automation_services",
  {
    automationId: uuid("automation_id")
      .notNull()
      .references(() => bookingServiceEmailAutomations.id, {
        onDelete: "cascade",
      }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => bookingServices.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (table) => [unique().on(table.automationId, table.serviceId)],
);

export const bookingBlockedTimes = pgTable("booking_blocked_times", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingAppointments = pgTable("booking_appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => bookingServices.id, { onDelete: "restrict" }),
  personId: uuid("person_id").references(() => people.id, {
    onDelete: "set null",
  }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  emailLookupHash: text("email_lookup_hash"),
  guestPhone: text("guest_phone").notNull(),
  guestAddress: text("guest_address").notNull(),
  guestPreferredLocale: text("guest_preferred_locale"),
  privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }).notNull(),
  status: bookingAppointmentStatusEnum("status").notNull().default("confirmed"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  hostUserId: uuid("host_user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  projectId: uuid("project_id").references(() => immigrationProjects.id, {
    onDelete: "set null",
  }),
  googleEventId: text("google_event_id"),
  microsoftEventId: text("microsoft_event_id"),
  meetJoinUrl: text("meet_join_url"),
  conferenceId: text("conference_id"),
  manageTokenHash: text("manage_token_hash"),
  manageTokenEncrypted: text("manage_token_encrypted"),
  formAnswers: jsonb("form_answers"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
},
(table) => [
  uniqueIndex("booking_appointments_manage_token_hash_uidx").on(
    table.manageTokenHash,
  ),
]);

export const contractTemplates = pgTable("contract_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull(),
  translations: jsonb("translations").notNull().default({}),
  requireConsultantSignature: boolean("require_consultant_signature")
    .notNull()
    .default(true),
  sendOnBooking: boolean("send_on_booking").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const contractTemplateServices = pgTable(
  "contract_template_services",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => contractTemplates.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => bookingServices.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (table) => [unique().on(table.templateId, table.serviceId)],
);

export const contractEnvelopes = pgTable("contract_envelopes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  templateId: uuid("template_id")
    .notNull()
    .references(() => contractTemplates.id, { onDelete: "restrict" }),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => bookingAppointments.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  filledHtml: text("filled_html").notNull(),
  filledSha256: text("filled_sha256").notNull(),
  signedPdfStoragePath: text("signed_pdf_storage_path"),
  signedPdfSha256: text("signed_pdf_sha256"),
  status: contractEnvelopeStatusEnum("status").notNull().default("sent"),
  locale: text("locale").notNull().default("en"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const contractSigners = pgTable("contract_signers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  envelopeId: uuid("envelope_id")
    .notNull()
    .references(() => contractEnvelopes.id, { onDelete: "cascade" }),
  role: contractSignerRoleEnum("role").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  tokenHash: text("token_hash"),
  tokenEncrypted: text("token_encrypted"),
  status: contractSignerStatusEnum("status").notNull().default("pending"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  signatureKind: contractSignatureKindEnum("signature_kind"),
  signatureText: text("signature_text"),
  signatureImage: text("signature_image"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }),
  consentVersion: text("consent_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const contractAuditEvents = pgTable("contract_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  envelopeId: uuid("envelope_id")
    .notNull()
    .references(() => contractEnvelopes.id, { onDelete: "cascade" }),
  signerId: uuid("signer_id").references(() => contractSigners.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Saved consultant signature used to pre-sign booking contracts. */
export const staffContractSignatures = pgTable(
  "staff_contract_signatures",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    presignAll: boolean("presign_all").notNull().default(false),
    signatureKind: contractSignatureKindEnum("signature_kind"),
    signatureText: text("signature_text"),
    signatureImage: text("signature_image"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
  ],
);

/** Single-use service booking links copied from the services list. */
export const bookingServiceLinks = pgTable("booking_service_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => bookingServices.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  rateKind: text("rate_kind").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  appointmentId: uuid("appointment_id").references(() => bookingAppointments.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Single-use “schedule a call” links emailed from a project file. */
export const projectBookingInvites = pgTable("project_booking_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  hostUserId: uuid("host_user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => bookingServices.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(),
  tokenEncrypted: text("token_encrypted"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  appointmentId: uuid("appointment_id").references(() => bookingAppointments.id, {
    onDelete: "set null",
  }),
  emailedTo: text("emailed_to"),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingAutomationSends = pgTable(
  "booking_automation_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => bookingServiceEmailAutomations.id, {
        onDelete: "cascade",
      }),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => bookingAppointments.id, { onDelete: "cascade" }),
    daysBefore: integer("days_before").notNull(),
    appointmentStartsAt: timestamp("appointment_starts_at", {
      withTimezone: true,
    }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("booking_automation_sends_once_uidx").on(
      table.automationId,
      table.appointmentId,
      table.daysBefore,
      table.appointmentStartsAt,
    ),
  ],
);

export const bookingAbuseEvents = pgTable("booking_abuse_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  emailHash: text("email_hash"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** One Google Calendar connection per staff user. Tokens live in private.google_calendar_secrets. */
export const googleCalendarConnections = pgTable(
  "google_calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    googleEmail: text("google_email"),
    calendarId: text("calendar_id").notNull().default("primary"),
    channelId: text("channel_id"),
    channelResourceId: text("channel_resource_id"),
    channelExpiration: timestamp("channel_expiration", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

/** One Square seller account per firm. Tokens in private.square_secrets. */
export const squareConnections = pgTable("square_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  connectedBy: uuid("connected_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  merchantId: text("merchant_id").notNull(),
  locationId: text("location_id").notNull(),
  currency: text("currency").notNull().default("CAD"),
  businessName: text("business_name"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  cancelRefundEnabled: boolean("cancel_refund_enabled").notNull().default(true),
  cancelFreeDaysBefore: integer("cancel_free_days_before").notNull().default(10),
  cancelMinDaysBefore: integer("cancel_min_days_before").notNull().default(2),
  cancelRefundFeeType: text("cancel_refund_fee_type").notNull().default("percent"),
  cancelRefundFeeCents: integer("cancel_refund_fee_cents").notNull().default(0),
  cancelRefundFeePercent: integer("cancel_refund_fee_percent").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** One Sage Business Cloud Accounting company per firm. Tokens in private.sage_secrets. */
export const sageConnections = pgTable("sage_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  connectedBy: uuid("connected_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  businessId: text("business_id").notNull(),
  businessName: text("business_name"),
  countryId: text("country_id"),
  currency: text("currency").notNull().default("CAD"),
  customerContactTypeId: text("customer_contact_type_id"),
  defaultLedgerAccountId: text("default_ledger_account_id"),
  defaultLedgerAccountName: text("default_ledger_account_name"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Sage tax rate to use for a country (+ optional region/province). */
export const sageTaxMappings = pgTable("sage_tax_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  countryCode: text("country_code").notNull(),
  regionCode: text("region_code"),
  sageTaxRateId: text("sage_tax_rate_id").notNull(),
  sageTaxRateName: text("sage_tax_rate_name"),
  percentage: numeric("percentage").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Checkout charges for bookings and ad-hoc project invoices. */
export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: paymentSourceEnum("source").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("CAD"),
    description: text("description").notNull(),
    projectId: uuid("project_id").references(() => immigrationProjects.id, {
      onDelete: "set null",
    }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    appointmentId: uuid("appointment_id").references(
      () => bookingAppointments.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEncrypted: text("token_encrypted"),
    squarePaymentLinkId: text("square_payment_link_id"),
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
    squareRefundId: text("square_refund_id"),
    checkoutUrl: text("checkout_url"),
    taxCents: integer("tax_cents").notNull().default(0),
    taxPercent: numeric("tax_percent"),
    taxLabel: text("tax_label"),
    taxCountry: text("tax_country"),
    taxRegion: text("tax_region"),
    sageTaxRateId: text("sage_tax_rate_id"),
    sageInvoiceId: text("sage_invoice_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_requests_square_order_uidx").on(table.squareOrderId),
    uniqueIndex("payment_requests_appointment_uidx").on(table.appointmentId),
  ],
);

export const bookingPaymentReminderSends = pgTable(
  "booking_payment_reminder_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => bookingAppointments.id, { onDelete: "cascade" }),
    paymentRequestId: uuid("payment_request_id")
      .notNull()
      .references(() => paymentRequests.id, { onDelete: "cascade" }),
    daysBefore: integer("days_before").notNull(),
    appointmentStartsAt: timestamp("appointment_starts_at", {
      withTimezone: true,
    }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("booking_payment_reminder_sends_once_uidx").on(
      table.appointmentId,
      table.daysBefore,
      table.appointmentStartsAt,
    ),
  ],
);

/** One Microsoft 365 / Outlook Calendar connection per staff user. */
export const microsoftCalendarConnections = pgTable(
  "microsoft_calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    microsoftEmail: text("microsoft_email"),
    calendarId: text("calendar_id").notNull().default("calendar"),
    channelId: text("channel_id"),
    channelExpiration: timestamp("channel_expiration", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

/** One Zoom connection per staff user for meeting join links. */
export const zoomConnections = pgTable(
  "zoom_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    zoomEmail: text("zoom_email"),
    zoomUserId: text("zoom_user_id"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

/** Which calendar and meeting vendor each staff member uses for bookings. */
export const staffBookingIntegrations = pgTable(
  "staff_booking_integrations",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    calendarProvider: text("calendar_provider"),
    meetingProvider: text("meeting_provider"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

/** External Google events mirrored as busy intervals (not our bookings). */
export const bookingGoogleBusy = pgTable("booking_google_busy", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
  googleEventId: text("google_event_id").notNull(),
  summary: text("summary"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** External Outlook events mirrored as busy intervals (not our bookings). */
export const bookingMicrosoftBusy = pgTable("booking_microsoft_busy", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => microsoftCalendarConnections.id, { onDelete: "cascade" }),
  microsoftEventId: text("microsoft_event_id").notNull(),
  summary: text("summary"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** In-app notifications for firm staff (document uploads, form completion, IRCC cert). */
export const staffNotifications = pgTable("staff_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => immigrationProjects.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

const privateSchema = pgSchema("private");

export const portalAuthEvents = pgTable("portal_auth_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  accessHash: text("access_hash").notNull(),
  kind: text("kind").notNull(),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** bcrypt hashes — never exposed to anon/authenticated Data API. */
export const customerPortalSecrets = privateSchema.table(
  "customer_portal_secrets",
  {
    personId: uuid("person_id")
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

/** Google OAuth + watch tokens — service_role only. */
export const googleCalendarSecrets = privateSchema.table(
  "google_calendar_secrets",
  {
    connectionId: uuid("connection_id")
      .primaryKey()
      .references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    syncToken: text("sync_token"),
    channelTokenEncrypted: text("channel_token_encrypted"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

/** Microsoft OAuth + subscription tokens — service_role only. */
export const microsoftCalendarSecrets = privateSchema.table(
  "microsoft_calendar_secrets",
  {
    connectionId: uuid("connection_id")
      .primaryKey()
      .references(() => microsoftCalendarConnections.id, { onDelete: "cascade" }),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    syncToken: text("sync_token"),
    channelTokenEncrypted: text("channel_token_encrypted"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

/** Sage OAuth tokens — service_role only. */
export const sageSecrets = privateSchema.table("sage_secrets", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => sageConnections.id, { onDelete: "cascade" }),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Square OAuth tokens — service_role only. */
export const squareSecrets = privateSchema.table("square_secrets", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => squareConnections.id, { onDelete: "cascade" }),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Zoom OAuth tokens — service_role only. */
export const zoomSecrets = privateSchema.table("zoom_secrets", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => zoomConnections.id, { onDelete: "cascade" }),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  accessTokenEncrypted: text("access_token_encrypted"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Resend send log. Recipient is HMAC-hashed; service_role only. */
export const outboundEmails = pgTable("outbound_emails", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  resendEmailId: text("resend_email_id"),
  toHash: text("to_hash").notNull(),
  status: text("status").notNull().default("sent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Hard-bounce and spam-complaint suppressions. Hash only. */
export const emailSuppressions = pgTable("email_suppressions", {
  emailHash: text("email_hash").primaryKey(),
  reason: text("reason").notNull(),
  resendEmailId: text("resend_email_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ProgramFamily = (typeof programFamilyEnum.enumValues)[number];
export type ProjectJurisdiction =
  (typeof projectJurisdictionEnum.enumValues)[number];
export type ParticipantRole = (typeof participantRoleEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type PersonImmigrationStatus =
  (typeof personImmigrationStatusEnum.enumValues)[number];
export type DocumentRequestStatus =
  (typeof documentRequestStatusEnum.enumValues)[number];
export type DocumentDocKey = "passport" | "photo" | "custom";
export type DocumentRequestScope = "person" | "project";
export type BookingAppointmentStatus =
  (typeof bookingAppointmentStatusEnum.enumValues)[number];
export type BookingFormFieldType =
  (typeof bookingFormFieldTypeEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type PaymentSource = (typeof paymentSourceEnum.enumValues)[number];
export type ContractEnvelopeStatus =
  (typeof contractEnvelopeStatusEnum.enumValues)[number];
export type ContractSignerRole =
  (typeof contractSignerRoleEnum.enumValues)[number];
export type ContractSignerStatus =
  (typeof contractSignerStatusEnum.enumValues)[number];
export type ContractSignatureKind =
  (typeof contractSignatureKindEnum.enumValues)[number];
