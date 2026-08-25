"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseBookingFormAnswers } from "@/lib/booking/form-fields";
import type { BookingFormFieldRow } from "@/lib/booking/types";
import {
  getActiveProjectContract,
  saveProjectContractFormAnswers,
} from "@/lib/contracts/project-contracts";
import {
  assertPortalProjectAccess,
  getPortalSession,
} from "@/lib/portal/auth";
import { createServiceClient } from "@/lib/supabase/admin";

export type PortalContractFormState = {
  error?: string;
  message?: string;
};

export async function submitPortalProjectContractFormAction(
  _prev: PortalContractFormState,
  formData: FormData,
): Promise<PortalContractFormState> {
  const session = await getPortalSession();
  if (!session) return { error: "unauthorized" };

  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]),
      projectId: z.string().uuid(),
      contractId: z.string().uuid(),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      projectId: formData.get("projectId"),
      contractId: formData.get("contractId"),
    });
  if (!parsed.success) return { error: "invalid" };

  try {
    await assertPortalProjectAccess(session, parsed.data.projectId);
  } catch {
    return { error: "forbidden" };
  }

  const admin = createServiceClient();
  const { data: principal } = await admin
    .from("project_participants")
    .select("id")
    .eq("project_id", parsed.data.projectId)
    .eq("person_id", session.personId)
    .eq("organization_id", session.organizationId)
    .eq("role", "principal")
    .is("left_at", null)
    .maybeSingle();
  if (!principal) return { error: "forbidden" };

  const contract = await getActiveProjectContract(parsed.data.projectId);
  if (
    !contract ||
    contract.id !== parsed.data.contractId ||
    contract.status !== "pending_signature" ||
    !contract.form_id ||
    contract.form_submitted_at
  ) {
    return { error: "invalid_state" };
  }

  const { data: fields } = await admin
    .from("booking_service_form_fields")
    .select("*")
    .eq("form_id", contract.form_id)
    .eq("organization_id", session.organizationId)
    .order("sort_order", { ascending: true });

  const parsedAnswers = parseBookingFormAnswers(
    formData,
    (fields ?? []) as BookingFormFieldRow[],
  );
  if (!parsedAnswers.ok) return { error: "invalid_form" };

  try {
    await saveProjectContractFormAnswers({
      contractId: contract.id,
      answers: parsedAnswers.answers,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "already_submitted") return { error: "already_submitted" };
    console.error("portal contract form:", err);
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/portal/projects/${parsed.data.projectId}`);
  revalidatePath(
    `/${parsed.data.locale}/portal/projects/${parsed.data.projectId}/contract`,
  );
  return { message: "submitted" };
}
