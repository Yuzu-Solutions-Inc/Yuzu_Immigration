import { resolve } from "node:path";

import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/admin");
  const { loadOrCreateOrgDataKey } = await import(
    "../src/lib/security/org-data-key"
  );
  const {
    decryptBookingGuestRow,
    decryptPersonRow,
  } = await import("../src/lib/security/client-pii");
  const { appointmentLookupWrite, personLookupWrite } = await import(
    "../src/lib/security/email-lookup"
  );
  const { refreshProjectProgress } = await import("../src/lib/crm/progress");

  const admin = createServiceClient();

  const { data: people, error: peopleError } = await admin
    .from("people")
    .select("id, organization_id, first_name, last_name, email");
  if (peopleError) throw new Error(peopleError.message);

  let peopleUpdated = 0;
  for (const row of people ?? []) {
    const orgId = row.organization_id as string;
    const key = await loadOrCreateOrgDataKey(orgId);
    const person = decryptPersonRow(
      {
        first_name: row.first_name as string,
        last_name: row.last_name as string,
        email: row.email as string | null,
      },
      key,
    );
    const { error } = await admin
      .from("people")
      .update(personLookupWrite(orgId, person, key))
      .eq("id", row.id as string);
    if (error) throw new Error(error.message);
    peopleUpdated += 1;
  }

  const { data: appointments, error: appointmentError } = await admin
    .from("booking_appointments")
    .select("id, organization_id, guest_name, guest_email");
  if (appointmentError) throw new Error(appointmentError.message);

  let appointmentsUpdated = 0;
  for (const row of appointments ?? []) {
    const orgId = row.organization_id as string;
    const key = await loadOrCreateOrgDataKey(orgId);
    const guest = decryptBookingGuestRow(
      {
        guest_name: row.guest_name as string,
        guest_email: row.guest_email as string,
      },
      key,
    );
    const { error } = await admin
      .from("booking_appointments")
      .update(appointmentLookupWrite(orgId, guest.guest_email, key))
      .eq("id", row.id as string);
    if (error) throw new Error(error.message);
    appointmentsUpdated += 1;
  }

  const { data: projects, error: projectError } = await admin
    .from("immigration_projects")
    .select("id, organization_id");
  if (projectError) throw new Error(projectError.message);

  let projectsUpdated = 0;
  for (const row of projects ?? []) {
    const orgId = row.organization_id as string;
    await refreshProjectProgress(orgId, row.id as string, admin);
    projectsUpdated += 1;
  }

  console.log(
    JSON.stringify({ peopleUpdated, appointmentsUpdated, projectsUpdated }),
  );
}

main().catch((error: unknown) => {
  console.error(
    "backfill-scale-lookups failed:",
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exit(1);
});
