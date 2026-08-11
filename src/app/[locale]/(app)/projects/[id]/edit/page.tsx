import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { ProjectForm } from "@/components/projects/project-form";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { inferCompositionFromRoles } from "@/lib/crm/programs";
import {
  getProject,
  getProjectParticipants,
  listOrgMembers,
  listPeople,
} from "@/lib/crm/queries";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const project = await getProject(id);
  if (!project) notFound();

  const [participants, people, members, user, t] = await Promise.all([
    getProjectParticipants(id),
    listPeople(),
    listOrgMembers(),
    getSessionUser(),
    getTranslations("projects"),
  ]);

  const slots = participants
    .filter((row) => row.person)
    .map((row) => ({
      role: row.role,
      mode: "existing" as const,
      personId: row.person!.id,
      firstName: row.person!.first_name,
      lastName: row.person!.last_name,
      email: row.person!.email ?? "",
      immigrationStatus: "none" as const,
      statusExpiresAt: "",
    }));

  const composition = inferCompositionFromRoles(slots.map((s) => s.role));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href={`/projects/${project.id}`}
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToProject")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("editTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("editSubtitle")}</p>
      </div>

      <SurfaceCard>
        <ProjectForm
          locale={locale}
          people={people}
          members={members.map((m) => ({
            user_id: m.user_id,
            full_name: m.profile.full_name,
            email: m.profile.email,
          }))}
          currentUserId={user?.id}
          initial={{
            projectId: project.id,
            title: project.title,
            description: project.description ?? "",
            notes: project.notes ?? "",
            status: project.status,
            statusAt: project.status_at,
            submitBefore: project.submit_before ?? "",
            composition,
            programFamily: project.program_family,
            jurisdiction: project.jurisdiction,
            formLanguage:
              project.form_language === "fr" ? "fr" : "en",
            representativeUserId: project.representative_user_id ?? "",
            slots: slots.length
              ? slots
              : [
                  {
                    role: "principal" as const,
                    mode: "new" as const,
                    personId: "",
                    firstName: "",
                    lastName: "",
                    email: "",
                    immigrationStatus: "none" as const,
                    statusExpiresAt: "",
                  },
                ],
          }}
        />
      </SurfaceCard>
    </div>
  );
}
