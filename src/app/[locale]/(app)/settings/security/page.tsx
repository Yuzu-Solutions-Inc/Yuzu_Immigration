import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PrivacyLink } from "@/components/legal/privacy-link";
import { SurfaceCard } from "@/components/layout/surface-card";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { decryptDestructionRow } from "@/lib/security/client-pii";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  action: string;
  actor_kind: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
  ip: string | null;
};

export default async function SecuritySettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);

  const t = await getTranslations("settings");

  if (!canAdministerOrg(membership.role)) {
    redirect(`/${locale}/settings/account`);
  }

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("security_audit_events")
    .select(
      "id, action, actor_kind, resource_type, resource_id, created_at, ip",
    )
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: destructions } = await supabase
    .from("file_destruction_register")
    .select(
      "id, client_name, service_summary, file_closed_at, destroyed_at",
    )
    .eq("organization_id", membership.organization.id)
    .order("destroyed_at", { ascending: false })
    .limit(25);

  const rows = (events ?? []) as AuditRow[];
  const destructionRows = ((destructions ?? []) as Array<{
    id: string;
    client_name: string;
    service_summary: string | null;
    file_closed_at: string | null;
    destroyed_at: string;
  }>).map(decryptDestructionRow);

  return (
    <SurfaceCard className="space-y-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("security")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("securityHelp")}</p>
        <PrivacyLink className="inline-block pt-1" />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-brand">
          {t("securityAuditHeading")}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("securityEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-canvas text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("securityColWhen")}</th>
                  <th className="px-3 py-2 font-medium">
                    {t("securityColAction")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("securityColActor")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("securityColResource")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/80">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(row.created_at).toLocaleString(locale)}
                    </td>
                    <td className="px-3 py-2 font-medium text-brand">
                      {row.action}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.actor_kind}
                      {row.ip ? ` · ${row.ip}` : ""}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[row.resource_type, row.resource_id]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-brand">
          {t("securityDestructionHeading")}
        </h3>
        {destructionRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("securityDestructionEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
            {destructionRows.map((row) => (
              <li key={row.id} className="space-y-0.5 px-3 py-2.5">
                <p className="font-medium text-brand">{row.client_name}</p>
                <p className="text-muted-foreground">
                  {row.service_summary ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("securityDestructionMeta", {
                    closed: row.file_closed_at
                      ? new Date(row.file_closed_at).toLocaleDateString(locale)
                      : "—",
                    destroyed: new Date(row.destroyed_at).toLocaleDateString(
                      locale,
                    ),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SurfaceCard>
  );
}
