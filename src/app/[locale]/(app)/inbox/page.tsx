import { getTranslations, setRequestLocale } from "next-intl/server";

import { InboundMailThread } from "@/components/email/inbound-thread";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listPeople, listProjects, requireOrganizationId } from "@/lib/crm/queries";
import { inboundAddressForLocalPart } from "@/lib/email/inbound-address";
import { listUnassignedInboundMessages } from "@/lib/email/inbound-queries";
import { createClient } from "@/lib/supabase/server";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("inboundMail");
  const tNav = await getTranslations("nav");
  const membership = await getPrimaryMembership();
  const orgId = await requireOrganizationId();
  const [messages, people, projects, org] = await Promise.all([
    listUnassignedInboundMessages(),
    listPeople(undefined, { limit: 200 }),
    listProjects(),
    (async () => {
      if (!orgId) return null;
      const supabase = await createClient();
      const { data } = await supabase
        .from("organizations")
        .select("inbound_local_part")
        .eq("id", orgId)
        .maybeSingle();
      return data;
    })(),
  ]);

  return (
    <div className={listPageClassName}>
      <div className={listPageHeaderClassName}>
        <h1 className={listPageTitleClassName}>{tNav("inbox")}</h1>
        <p className={listPageSubtitleClassName}>{t("inboxHelp")}</p>
      </div>
      <InboundMailThread
        locale={locale}
        messages={messages}
        inboundAddress={inboundAddressForLocalPart(
          (org?.inbound_local_part as string | undefined) ?? "",
        )}
        canWrite={canCreateRecords(membership?.role)}
        showReply={false}
        showHeading={false}
        emptyLabel={t("emptyInbox")}
        assignPeople={people.map((person) => ({
          id: person.id,
          label: `${person.first_name} ${person.last_name}`.trim(),
        }))}
        assignProjects={projects
          .filter((project) => !project.closed_at && !project.destroyed_at)
          .map((project) => ({
            id: project.id,
            label: project.title,
          }))}
      />
    </div>
  );
}
