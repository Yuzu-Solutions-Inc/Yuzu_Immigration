"use server";

import { z } from "zod";

import {
  BOOKING_LIST_STATUSES,
  BOOKING_PAYMENT_STATUSES,
  listOrgBookingsPage,
  type BookingsListFilters,
} from "@/lib/booking/bookings-list";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";
import { PROGRAM_FAMILIES } from "@/lib/crm/programs";
import {
  listPeoplePage,
  listProjectsPage,
  requireOrganizationId,
  type PeopleListFilters,
  type ProjectsListFilters,
} from "@/lib/crm/queries";
import { PROJECT_STATUSES } from "@/lib/crm/statuses";
import { LIST_PAGE_SIZE } from "@/lib/lists/pagination";

const pageSchema = z.object({
  offset: z.number().int().min(0).max(5_000_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const peoplePageSchema = pageSchema.extend({
  nameQuery: z.string().max(120).optional(),
  emailQuery: z.string().max(120).optional(),
  status: z.enum(["all", ...PERSON_IMMIGRATION_STATUSES]).optional(),
  expiry: z.enum(["all", "expired", "expiring_30", "no_date"]).optional(),
  sortKey: z
    .enum([
      "name",
      "email",
      "immigration_status",
      "status_expires_at",
      "updated_at",
    ])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

const projectsPageSchema = pageSchema.extend({
  titleQuery: z.string().max(120).optional(),
  program: z
    .enum(["all", ...(PROGRAM_FAMILIES as [string, ...string[]])])
    .optional(),
  status: z.enum(["all", ...PROJECT_STATUSES]).optional(),
  representative: z
    .union([z.literal("all"), z.literal("unassigned"), z.string().uuid()])
    .optional(),
  sortKey: z
    .enum([
      "title",
      "program_family",
      "created_at",
      "updated_at",
      "submit_before",
      "representative",
      "documents",
      "forms",
    ])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

const bookingsPageSchema = pageSchema.extend({
  guestQuery: z.string().max(120).optional(),
  time: z.enum(["all", "upcoming", "past", "today"]).optional(),
  serviceId: z.union([z.literal("all"), z.string().uuid()]).optional(),
  hostUserId: z.union([z.literal("all"), z.string().uuid()]).optional(),
  status: z.enum(["all", ...BOOKING_LIST_STATUSES]).optional(),
  payment: z.enum(["all", "none", ...BOOKING_PAYMENT_STATUSES]).optional(),
  sortKey: z
    .enum(["starts_at", "guest", "service", "host", "status", "payment"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  timezone: z.string().min(1).max(64),
  locale: z.enum(["en", "fr", "es"]).optional(),
});

export async function loadPeoplePageAction(
  input: PeopleListFilters & { offset?: number; limit?: number },
) {
  const parsed = peoplePageSchema.safeParse(input);
  if (!parsed.success) {
    return { items: [], total: 0 };
  }
  const { offset, limit, ...filters } = parsed.data;
  return listPeoplePage(filters, {
    offset,
    limit: limit ?? LIST_PAGE_SIZE,
  });
}

export async function loadProjectsPageAction(
  input: ProjectsListFilters & { offset?: number; limit?: number },
) {
  const parsed = projectsPageSchema.safeParse(input);
  if (!parsed.success) {
    return { items: [], total: 0, progressById: {} };
  }
  const { offset, limit, ...filters } = parsed.data;
  return listProjectsPage(
    {
      ...filters,
      program: filters.program as ProjectsListFilters["program"],
    },
    {
      offset,
      limit: limit ?? LIST_PAGE_SIZE,
    },
  );
}

export async function loadBookingsPageAction(
  input: Omit<BookingsListFilters, "timezone"> & {
    timezone: string;
    offset?: number;
    limit?: number;
  },
) {
  const parsed = bookingsPageSchema.safeParse(input);
  if (!parsed.success) {
    return { items: [], total: 0 };
  }
  const orgId = await requireOrganizationId();
  if (!orgId) return { items: [], total: 0 };
  const { offset, limit, ...filters } = parsed.data;
  return listOrgBookingsPage(orgId, filters, {
    offset,
    limit: limit ?? LIST_PAGE_SIZE,
  });
}
