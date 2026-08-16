import { getAppBaseUrl } from "@/lib/app-url";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import { serviceTitle } from "@/lib/booking/service-i18n";
import type { ParticipantRole, ProjectStatus } from "@/db/schema";
import {
  getPortalSession,
  type PortalSession,
} from "@/lib/portal/auth";
import {
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { decryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { MANAGE_TOKEN_AAD } from "@/lib/square/payments";
import { createServiceClient } from "@/lib/supabase/admin";

export type PortalPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  preferredLocale: string;
};

export type PortalProjectCard = {
  id: string;
  title: string;
  role: ParticipantRole;
  status: ProjectStatus;
  statusAt: string;
  programFamily: string;
  formPercent: number;
  docsDone: number;
  docsTotal: number;
};

export type PortalPaymentCard = {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type PortalAppointmentCard = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  serviceTitle: string;
  meetJoinUrl: string | null;
  manageUrl: string | null;
};

export type PortalHubData = {
  session: PortalSession;
  person: PortalPerson;
  organizationName: string;
  projects: PortalProjectCard[];
  payments: PortalPaymentCard[];
  appointments: PortalAppointmentCard[];
};

export async function loadPortalHub(
  locale: string,
): Promise<PortalHubData | null> {
  const session = await getPortalSession();
  if (!session) return null;

  const admin = createServiceClient();
  const key = await getOrgDataKey(session.organizationId);

  const [personRes, orgRes, linksRes] = await Promise.all([
    admin
      .from("people")
      .select("id, first_name, last_name, email, preferred_locale")
      .eq("id", session.personId)
      .eq("organization_id", session.organizationId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", session.organizationId)
      .maybeSingle(),
    admin
      .from("project_participants")
      .select("project_id, role, left_at")
      .eq("person_id", session.personId)
      .eq("organization_id", session.organizationId)
      .is("left_at", null),
  ]);

  if (!personRes.data) return null;
  const personRow = decryptPersonRow(personRes.data, key);

  const projectIds = (linksRes.data ?? []).map(
    (row) => row.project_id as string,
  );
  const roleByProject = new Map(
    (linksRes.data ?? []).map((row) => [
      row.project_id as string,
      row.role as ParticipantRole,
    ]),
  );

  const [projectsRes, paymentsRes, appointmentsRes] = await Promise.all([
    projectIds.length
      ? admin
          .from("immigration_projects")
          .select(
            "id, title, status, status_at, program_family, form_percent, docs_done, docs_total, destroyed_at",
          )
          .eq("organization_id", session.organizationId)
          .in("id", projectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    admin
      .from("payment_requests")
      .select(
        "id, description, amount_cents, currency, status, checkout_url, paid_at, created_at, person_id, project_id",
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("booking_appointments")
      .select(
        "id, starts_at, ends_at, status, meet_join_url, manage_token_encrypted, service_id, service:booking_services(title, translations)",
      )
      .eq("organization_id", session.organizationId)
      .eq("person_id", session.personId)
      .order("starts_at", { ascending: false })
      .limit(20),
  ]);

  const projects: PortalProjectCard[] = ((projectsRes.data ?? []) as Array<{
    id: string;
    title: string;
    status: ProjectStatus;
    status_at: string;
    program_family: string;
    form_percent: number | null;
    docs_done: number | null;
    docs_total: number | null;
    destroyed_at: string | null;
  }>)
    .filter((row) => !row.destroyed_at)
    .map((row) => {
      const decrypted = decryptProjectRow(row, key);
      return {
        id: row.id,
        title: decrypted.title,
        role: roleByProject.get(row.id) ?? "principal",
        status: row.status,
        statusAt: row.status_at,
        programFamily: row.program_family,
        formPercent: row.form_percent ?? 0,
        docsDone: row.docs_done ?? 0,
        docsTotal: row.docs_total ?? 0,
      };
    });

  const projectIdSet = new Set(projects.map((p) => p.id));
  const payments: PortalPaymentCard[] = (
    (paymentsRes.data ?? []) as Array<{
      id: string;
      description: string;
      amount_cents: number;
      currency: string;
      status: string;
      checkout_url: string | null;
      paid_at: string | null;
      created_at: string;
      person_id: string | null;
      project_id: string | null;
    }>
  )
    .filter(
      (row) =>
        row.person_id === session.personId ||
        (row.project_id && projectIdSet.has(row.project_id)),
    )
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      description: row.description,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      checkoutUrl: row.checkout_url,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    }));

  const origin = await getAppBaseUrl();
  const appointments: PortalAppointmentCard[] = [];
  for (const row of (appointmentsRes.data ?? []) as Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    meet_join_url: string | null;
    manage_token_encrypted: string | null;
    service_id: string;
    service:
      | { title: string | null; translations: unknown }
      | { title: string | null; translations: unknown }[]
      | null;
  }>) {
    const service = Array.isArray(row.service) ? row.service[0] : row.service;
    let manageUrl: string | null = null;
    if (row.manage_token_encrypted) {
      try {
        const token = decryptField(row.manage_token_encrypted, MANAGE_TOKEN_AAD, key);
        manageUrl = bookingManageUrls(origin, locale, token).manageUrl;
      } catch (err) {
        console.error("portal manage token:", err);
      }
    }
    appointments.push({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      serviceTitle: serviceTitle(service, locale) || "",
      meetJoinUrl: row.meet_join_url,
      manageUrl,
    });
  }

  return {
    session,
    person: {
      id: session.personId,
      firstName: personRow.first_name,
      lastName: personRow.last_name,
      email: personRow.email,
      preferredLocale: personRow.preferred_locale ?? "en",
    },
    organizationName: String(orgRes.data?.name ?? ""),
    projects,
    payments,
    appointments,
  };
}

export async function loadPortalHeader(): Promise<{
  organizationName: string;
  personName: string;
} | null> {
  const session = await getPortalSession();
  if (!session) return null;
  const admin = createServiceClient();
  const key = await getOrgDataKey(session.organizationId);
  const [personRes, orgRes] = await Promise.all([
    admin
      .from("people")
      .select("first_name, last_name")
      .eq("id", session.personId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", session.organizationId)
      .maybeSingle(),
  ]);
  const person = personRes.data
    ? decryptPersonRow(personRes.data, key)
    : null;
  return {
    organizationName: String(orgRes.data?.name ?? ""),
    personName: person
      ? `${person.first_name} ${person.last_name}`.trim()
      : "",
  };
}
