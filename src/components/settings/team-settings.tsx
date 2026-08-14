"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  inviteOrgMemberAction,
  removeOrgMemberAction,
  revokeOrgInvitationAction,
  updateOrgMemberRoleAction,
  type TeamActionState,
} from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgRole } from "@/lib/auth/rbac";
import { ORG_ROLES } from "@/lib/auth/rbac";
import type { AppLocale } from "@/lib/i18n/locales";

const empty: TeamActionState = {};

type Member = {
  id: string;
  user_id: string;
  role: OrgRole;
  profile: { full_name: string | null; email: string | null };
};

type Invitation = {
  id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
};

function teamErrorMessage(
  error: string | undefined,
  t: (key: string) => string,
) {
  if (!error) return null;
  return (
    {
      invalid: t("errors.invalid"),
      forbidden: t("errors.forbidden"),
      already_member: t("errors.alreadyMember"),
      invite_failed: t("errors.inviteFailed"),
      last_admin: t("errors.lastAdmin"),
      cannot_remove_self: t("errors.cannotRemoveSelf"),
      not_found: t("errors.notFound"),
      save_failed: t("errors.saveFailed"),
    }[error] ?? t("errors.generic")
  );
}

function teamSuccessMessage(
  message: string | undefined,
  t: (key: string) => string,
) {
  if (!message) return null;
  return (
    {
      invited: t("inviteSent"),
      invite_link: t("inviteLinkReady"),
      revoked: t("inviteRevoked"),
      role_updated: t("roleUpdated"),
      removed: t("memberRemoved"),
    }[message] ?? null
  );
}

export function TeamSettings({
  locale,
  currentUserId,
  members,
  invitations,
}: {
  locale: AppLocale;
  currentUserId: string;
  members: Member[];
  invitations: Invitation[];
}) {
  const t = useTranslations("settings");
  const tRoles = useTranslations("orgRoles");
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteOrgMemberAction,
    empty,
  );
  const [memberState, memberAction, memberPending] = useActionState(
    updateOrgMemberRoleAction,
    empty,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeOrgMemberAction,
    empty,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeOrgInvitationAction,
    empty,
  );
  const [copied, setCopied] = useState(false);

  const error =
    teamErrorMessage(inviteState.error, t) ||
    teamErrorMessage(memberState.error, t) ||
    teamErrorMessage(removeState.error, t) ||
    teamErrorMessage(revokeState.error, t);
  const success =
    teamSuccessMessage(inviteState.message, t) ||
    teamSuccessMessage(memberState.message, t) ||
    teamSuccessMessage(removeState.message, t) ||
    teamSuccessMessage(revokeState.message, t);

  return (
    <section className="space-y-6 border-t border-border pt-6">
      <div>
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("team")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("teamHelp")}</p>
      </div>

      <form action={inviteAction} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
        <input type="hidden" name="locale" value={locale} />
        <div className="space-y-2">
          <Label htmlFor="inviteEmail">{t("inviteEmail")}</Label>
          <Input
            id="inviteEmail"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inviteRole">{t("inviteRole")}</Label>
          <select
            id="inviteRole"
            name="role"
            defaultValue="consultant"
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            {ORG_ROLES.map((role) => (
              <option key={role} value={role}>
                {tRoles(role)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={invitePending}>
            {invitePending ? t("inviteSending") : t("inviteSend")}
          </Button>
        </div>
      </form>

      {inviteState.inviteUrl ? (
        <div className="space-y-2 rounded-xl border border-border bg-canvas p-3">
          <p className="text-sm text-muted-foreground">{t("inviteLinkReady")}</p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={inviteState.inviteUrl} className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteState.inviteUrl!);
                setCopied(true);
              }}
            >
              {copied ? t("copied") : t("copyLink")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-success" role="status">
          {success}
        </p>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-brand">{t("members")}</h4>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {members.map((member) => {
            const name =
              member.profile.full_name || member.profile.email || member.user_id;
            const isSelf = member.user_id === currentUserId;
            return (
              <li
                key={member.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand">{name}</p>
                  {member.profile.email && member.profile.full_name ? (
                    <p className="truncate text-sm text-muted-foreground">
                      {member.profile.email}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={memberAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <select
                      name="role"
                      defaultValue={member.role}
                      disabled={memberPending}
                      onChange={(event) => event.currentTarget.form?.requestSubmit()}
                      aria-label={t("changeRole")}
                      className="h-9 rounded-xl border border-input bg-surface px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                    >
                      {ORG_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {tRoles(role)}
                        </option>
                      ))}
                    </select>
                  </form>
                  {isSelf ? null : (
                    <form
                      action={removeAction}
                      onSubmit={(event) => {
                        if (!window.confirm(t("removeConfirm", { name }))) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={removePending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {t("removeMember")}
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-brand">{t("pendingInvites")}</h4>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPendingInvites")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {invitations.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-brand">{invite.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {tRoles(invite.role)} ·{" "}
                    {t("inviteExpires", {
                      date: new Date(invite.expires_at).toLocaleDateString(
                        locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
                        { year: "numeric", month: "short", day: "numeric" },
                      ),
                    })}
                  </p>
                </div>
                <form action={revokeAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="invitationId" value={invite.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={revokePending}
                  >
                    {t("revoke")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
