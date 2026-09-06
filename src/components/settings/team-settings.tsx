"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  inviteOrgMemberAction,
  removeOrgMemberAction,
  revokeOrgInvitationAction,
  transferOrgOwnershipAction,
  updateOrgMemberRoleAction,
  updateRenewalLicenseRosterAction,
  type TeamActionState,
} from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, FieldLabel, FieldSuccess } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { OrgAccessLevel, OrgRole } from "@/lib/auth/rbac";
import { ASSIGNABLE_ORG_ROLES, isOwner } from "@/lib/auth/rbac";
import type { AppLocale } from "@/lib/i18n/locales";

const empty: TeamActionState = {};

type Member = {
  id: string;
  user_id: string;
  role: OrgRole;
  is_licensed: boolean;
  licensed_at_renewal: boolean | null;
  profile: { full_name: string | null; email: string | null };
};

type Invitation = {
  id: string;
  email: string;
  role: OrgRole;
  is_licensed: boolean;
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
      seats_exceeded: t("errors.seatsExceeded"),
      renewal_seats_exceeded: t("errors.renewalSeatsExceeded"),
      seat_charge_failed: t("errors.seatChargeFailed"),
      not_configured: t("errors.seatChargeFailed"),
      last_admin: t("errors.lastAdmin"),
      last_owner: t("errors.lastOwner"),
      owner_must_be_licensed: t("errors.ownerMustBeLicensed"),
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
      ownership_transferred: t("ownershipTransferred"),
      renewal_roster_updated: t("renewalRosterUpdated"),
    }[message] ?? null
  );
}

export function TeamSettings({
  locale,
  currentUserId,
  currentUserRole,
  members,
  invitations,
}: {
  locale: AppLocale;
  currentUserId: string;
  currentUserRole: OrgAccessLevel;
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
  const [transferState, transferAction, transferPending] = useActionState(
    transferOrgOwnershipAction,
    empty,
  );
  const [rosterState, rosterAction, rosterPending] = useActionState(
    updateRenewalLicenseRosterAction,
    empty,
  );
  const [copied, setCopied] = useState(false);

  const currentIsOwner = isOwner(currentUserRole);
  const error =
    teamErrorMessage(inviteState.error, t) ||
    teamErrorMessage(memberState.error, t) ||
    teamErrorMessage(removeState.error, t) ||
    teamErrorMessage(revokeState.error, t) ||
    teamErrorMessage(transferState.error, t) ||
    teamErrorMessage(rosterState.error, t);
  const success =
    teamSuccessMessage(inviteState.message, t) ||
    teamSuccessMessage(memberState.message, t) ||
    teamSuccessMessage(removeState.message, t) ||
    teamSuccessMessage(revokeState.message, t) ||
    teamSuccessMessage(transferState.message, t) ||
    teamSuccessMessage(rosterState.message, t);

  return (
    <section className="space-y-6">
      <form
        action={inviteAction}
        className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
      >
        <input type="hidden" name="locale" value={locale} />
        <Field>
          <FieldLabel htmlFor="inviteEmail" required>
            {t("inviteEmail")}
          </FieldLabel>
          <Input
            id="inviteEmail"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="inviteRole">{t("inviteRole")}</FieldLabel>
          <NativeSelect
            id="inviteRole"
            name="access"
            defaultValue="member"
          >
            {ASSIGNABLE_ORG_ROLES.map((role) => (
              <option key={role} value={role}>
                {tRoles(role)}
              </option>
            ))}
            <option value="unlicensed">{tRoles("unlicensed")}</option>
          </NativeSelect>
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={invitePending}>
            {invitePending
              ? t("inviteSending")
              : t("inviteSend")}
          </Button>
        </div>
        <FieldHint className="sm:col-span-3">
          {t("teamInviteLicenseHint")}
        </FieldHint>
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

      {error ? <FieldError>{error}</FieldError> : null}
      {success ? <FieldSuccess>{success}</FieldSuccess> : null}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-brand">{t("members")}</h4>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {members.map((member) => {
            const name =
              member.profile.full_name || member.profile.email || member.user_id;
            const isSelf = member.user_id === currentUserId;
            const memberIsOwner = isOwner(member.role);
            const roleLocked = memberIsOwner;
            const access = member.is_licensed ? member.role : "unlicensed";
            const renewalLicensed =
              member.licensed_at_renewal ?? member.is_licensed;
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
                  {renewalLicensed !== member.is_licensed ? (
                    <p className="text-xs text-muted-foreground">
                      {renewalLicensed
                        ? t("teamLicensedAtRenewal")
                        : t("teamUnlicensedAtRenewal")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={memberAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <NativeSelect
                      name="access"
                      density="compact"
                      defaultValue={access}
                      disabled={memberPending || roleLocked}
                      title={roleLocked ? t("errors.lastOwner") : undefined}
                      onChange={(event) => event.currentTarget.form?.requestSubmit()}
                      aria-label={t("changeRole")}
                      className="w-auto"
                    >
                      {memberIsOwner ? (
                        <option value="owner">{tRoles("owner")}</option>
                      ) : (
                        ASSIGNABLE_ORG_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {tRoles(role)}
                          </option>
                        ))
                      )}
                      {!memberIsOwner ? (
                        <option value="unlicensed">
                          {tRoles("unlicensed")}
                        </option>
                      ) : null}
                    </NativeSelect>
                  </form>
                  {currentIsOwner && !memberIsOwner && member.is_licensed ? (
                    <form
                      action={transferAction}
                      onSubmit={(event) => {
                        if (!window.confirm(t("transferOwnershipConfirm", { name }))) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={transferPending}
                      >
                        {t("transferOwnership")}
                      </Button>
                    </form>
                  ) : null}
                  {isSelf || memberIsOwner ? null : (
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

      {members.some((member) => member.licensed_at_renewal !== null) ? (
        <form
          action={rosterAction}
          className="space-y-3 rounded-xl border border-border bg-canvas p-4"
        >
          <input type="hidden" name="locale" value={locale} />
          <div>
            <h4 className="text-sm font-semibold text-brand">
              {t("billingRenewalRoster")}
            </h4>
            <FieldHint>{t("renewalRosterHint")}</FieldHint>
          </div>
          <div className="space-y-2">
            {members.map((member) => {
              const owner = isOwner(member.role);
              const checked =
                member.licensed_at_renewal ?? member.is_licensed;
              const name =
                member.profile.full_name ??
                member.profile.email ??
                member.user_id;
              return (
                <label
                  key={member.id}
                  className="flex items-center gap-2 text-sm text-brand"
                >
                  {owner ? (
                    <input
                      type="hidden"
                      name="licensedMemberIds"
                      value={member.id}
                    />
                  ) : null}
                  <input
                    type="checkbox"
                    name="licensedMemberIds"
                    value={member.id}
                    defaultChecked={checked}
                    disabled={owner}
                    className="size-4 rounded border-input"
                  />
                  {name}
                </label>
              );
            })}
          </div>
          <Button type="submit" variant="outline" disabled={rosterPending}>
            {rosterPending ? t("saving") : t("saveRenewalRoster")}
          </Button>
        </form>
      ) : null}

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
                    {invite.is_licensed
                      ? tRoles(invite.role)
                      : tRoles("unlicensed")}{" "}
                    ·{" "}
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
