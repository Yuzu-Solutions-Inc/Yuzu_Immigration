"use server";

import { z } from "zod";

import { listPeople, searchProjects } from "@/lib/crm/queries";
import {
  listStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationsRead,
  type StaffNotificationRow,
} from "@/lib/notifications/queries";

export type WorkspaceSearchHit =
  | {
      type: "project";
      id: string;
      title: string;
      subtitle: string | null;
      href: string;
    }
  | {
      type: "person";
      id: string;
      title: string;
      subtitle: string | null;
      href: string;
    };

export async function searchWorkspaceAction(
  query: string,
): Promise<WorkspaceSearchHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  if (q.length > 120) return [];

  const [projects, people] = await Promise.all([
    searchProjects(q, 8),
    listPeople(q, { limit: 8 }),
  ]);

  const projectHits: WorkspaceSearchHit[] = projects.map((project) => ({
    type: "project" as const,
    id: project.id,
    title: project.title,
    subtitle: project.organization_program_name ?? project.status,
    href: `/projects/${project.id}`,
  }));

  const personHits: WorkspaceSearchHit[] = people.map((person) => ({
    type: "person" as const,
    id: person.id,
    title: `${person.first_name} ${person.last_name}`.trim(),
    subtitle: person.email,
    href: `/partners/${person.partner_id || person.id}`,
  }));

  return [...projectHits, ...personHits].slice(0, 12);
}

export async function getNotificationsAction(): Promise<StaffNotificationRow[]> {
  return listStaffNotifications();
}

export async function markNotificationsReadAction(
  ids: string[],
): Promise<{ ok: boolean }> {
  const parsed = z.array(z.string().uuid()).safeParse(ids);
  if (!parsed.success) return { ok: false };
  return { ok: await markStaffNotificationsRead(parsed.data) };
}

export async function markAllNotificationsReadAction(): Promise<{
  ok: boolean;
}> {
  return { ok: await markAllStaffNotificationsRead() };
}
