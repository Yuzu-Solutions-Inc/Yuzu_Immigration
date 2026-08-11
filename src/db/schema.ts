import {
  boolean,
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
  "owner",
  "admin",
  "member",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "on_hold",
  "submitted",
  "closed",
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
    role: orgMemberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

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
  status: projectStatusEnum("status").notNull().default("active"),
  jurisdiction: projectJurisdictionEnum("jurisdiction")
    .notNull()
    .default("federal"),
  programFamily: programFamilyEnum("program_family").notNull().default("other"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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
