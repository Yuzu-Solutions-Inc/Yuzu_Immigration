import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orgMemberRoleEnum = pgEnum("org_member_role", [
  "admin",
  "consultant",
  "assistant",
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
    role: orgMemberRoleEnum("role").notNull().default("consultant"),
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
  phone: text("phone"),
  preferredLocale: text("preferred_locale").default("en").notNull(),
  immigrationStatus: personImmigrationStatusEnum("immigration_status")
    .notNull()
    .default("none"),
  statusExpiresAt: date("status_expires_at"),
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
export const personNotes = pgTable("person_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
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

export const immigrationProjects = pgTable("immigration_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  notes: text("notes"),
  status: projectStatusEnum("status").notNull().default("new"),
  statusAt: date("status_at").notNull().default(sql`current_date`),
  submitBefore: date("submit_before"),
  jurisdiction: projectJurisdictionEnum("jurisdiction")
    .notNull()
    .default("federal"),
  programFamily: programFamilyEnum("program_family").notNull().default("other"),
  /** IRCC PDF blank language: en or fr. */
  formLanguage: text("form_language").notNull().default("en"),
  representativeUserId: uuid("representative_user_id").references(
    () => profiles.id,
    { onDelete: "set null" },
  ),
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

/** Assistants only see projects they are shared on. */
export const projectStaffAccess = pgTable(
  "project_staff_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => immigrationProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.projectId, table.userId)],
);

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
 * URL: /portal/[access_token] or login with access_code + password.
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const formShareLinks = pgTable("form_share_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => immigrationProjects.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
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
  isRequired: boolean("is_required").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  status: documentRequestStatusEnum("status").notNull().default("requested"),
  consultantNote: text("consultant_note"),
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
  uploadedVia: text("uploaded_via").notNull().default("share_link"),
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

const privateSchema = pgSchema("private");

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
