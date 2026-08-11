"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { requireOrganizationId } from "@/lib/crm/queries";
import {
  PROGRAM_FAMILIES,
  buildProjectTitle,
  defaultJurisdictionForProgram,
  type ProjectComposition,
} from "@/lib/crm/programs";
import type { ParticipantRole, ProgramFamily } from "@/db/schema";

const participantInputSchema = z.object({
  personId: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum([
    "principal",
    "spouse",
    "partner",
    "dependent",
    "sponsor",
    "accompanying",
  ]),
});

const createProjectSchema = z.object({
  locale: z.enum(["en", "fr"]).default("en"),
  composition: z.enum(["individual", "couple", "family"]),
  programFamily: z.enum(PROGRAM_FAMILIES as [ProgramFamily, ...ProgramFamily[]]),
  jurisdiction: z.enum(["federal", "quebec", "both"]).optional(),
  title: z.string().trim().max(200).optional(),
  participants: z.array(participantInputSchema).min(1),
});

export type CreateProjectState = {
  error?: string;
};

function programLabel(family: ProgramFamily, locale: "en" | "fr") {
  const labels: Record<ProgramFamily, { en: string; fr: string }> = {
    study_permit: { en: "Study permit", fr: "Permis d’études" },
    work_permit: { en: "Work permit", fr: "Permis de travail" },
    visitor: { en: "Visitor / TRV", fr: "Visiteur / VRT" },
    pgwp: { en: "PGWP", fr: "PTPD" },
    express_entry: { en: "Express Entry", fr: "Entrée express" },
    pnp: { en: "PNP", fr: "PCP" },
    family_sponsorship: { en: "Family sponsorship", fr: "Parrainage familial" },
    humanitarian: { en: "Humanitarian", fr: "Humanitaire" },
    quebec_pstq: { en: "Quebec PSTQ", fr: "PSTQ Québec" },
    quebec_family: { en: "Quebec family", fr: "Réunification Québec" },
    quebec_temporary: { en: "Quebec temporary", fr: "Temporaire Québec" },
    other: { en: "Other", fr: "Autre" },
  };
  return labels[family][locale];
}

export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const locale = (formData.get("locale") as "en" | "fr") || "en";
  const composition = formData.get("composition") as ProjectComposition;
  const programFamily = formData.get("programFamily") as ProgramFamily;
  const jurisdictionRaw = String(formData.get("jurisdiction") || "");
  const titleRaw = String(formData.get("title") || "").trim();

  const participantsJson = String(formData.get("participants") || "[]");
  let participantsParsed: unknown;
  try {
    participantsParsed = JSON.parse(participantsJson);
  } catch {
    return { error: "invalid" };
  }

  const parsed = createProjectSchema.safeParse({
    locale,
    composition,
    programFamily,
    jurisdiction: jurisdictionRaw || undefined,
    title: titleRaw || undefined,
    participants: participantsParsed,
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${locale}/onboarding`);
  }

  const supabase = await createClient();
  const jurisdiction =
    parsed.data.jurisdiction ??
    defaultJurisdictionForProgram(parsed.data.programFamily);

  const resolvedPeople: Array<{
    id: string;
    role: ParticipantRole;
    displayName: string;
  }> = [];

  for (const participant of parsed.data.participants) {
    if (participant.personId) {
      const { data: existing, error } = await supabase
        .from("people")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .eq("id", participant.personId)
        .maybeSingle();

      if (error || !existing) {
        return { error: "person_missing" };
      }

      resolvedPeople.push({
        id: existing.id as string,
        role: participant.role,
        displayName: `${existing.first_name} ${existing.last_name}`.trim(),
      });
      continue;
    }

    if (!participant.firstName || !participant.lastName) {
      return { error: "invalid" };
    }

    const { data: created, error: createError } = await supabase
      .from("people")
      .insert({
        organization_id: orgId,
        first_name: participant.firstName,
        last_name: participant.lastName,
        email: participant.email || null,
        preferred_locale: locale,
      })
      .select("id, first_name, last_name")
      .single();

    if (createError || !created) {
      console.error("create person:", createError?.message);
      return { error: "create_failed" };
    }

    resolvedPeople.push({
      id: created.id as string,
      role: participant.role,
      displayName: `${created.first_name} ${created.last_name}`.trim(),
    });
  }

  if (!resolvedPeople.some((p) => p.role === "principal")) {
    return { error: "principal_required" };
  }

  const title =
    parsed.data.title ||
    buildProjectTitle({
      programFamily: parsed.data.programFamily,
      programLabel: programLabel(parsed.data.programFamily, locale),
      peopleNames: resolvedPeople.map((p) => p.displayName),
    });

  const { data: project, error: projectError } = await supabase
    .from("immigration_projects")
    .insert({
      organization_id: orgId,
      title,
      status: "active",
      jurisdiction,
      program_family: parsed.data.programFamily,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("create project:", projectError?.message);
    return { error: "create_failed" };
  }

  const { error: linksError } = await supabase.from("project_participants").insert(
    resolvedPeople.map((person) => ({
      organization_id: orgId,
      project_id: project.id,
      person_id: person.id,
      role: person.role,
    })),
  );

  if (linksError) {
    console.error("create participants:", linksError.message);
    return { error: "create_failed" };
  }

  redirect(`/${locale}/projects/${project.id}`);
}
