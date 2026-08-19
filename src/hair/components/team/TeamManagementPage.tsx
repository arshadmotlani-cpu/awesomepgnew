'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { inviteTeamMemberAction, type TeamActionState } from '@/src/hair/actions/team';
import type { TeamManagementAccess } from '@/src/hair/lib/auth/teamManagementAccess';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import type { TeamInvitationRow, TeamLocationOption, TeamMemberRow } from '@/src/hair/services/team';

const ROLE_LABEL: Record<PlatformMembershipRole, string> = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  manager: 'Manager',
  biller: 'Biller',
  staff: 'Staff',
};

export function TeamManagementPage({
  members,
  invitations,
  locations,
  access,
}: {
  members: TeamMemberRow[];
  invitations: TeamInvitationRow[];
  locations: TeamLocationOption[];
  access: TeamManagementAccess;
}) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteTeamMemberAction, {} as TeamActionState);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fyh-text">Team</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Organization members, roles, and location access.
          </p>
        </div>
      </div>

      {access.canInvite ? (
        <section className="fyh-glass space-y-4 p-5">
          <h2 className="text-base font-semibold text-fyh-text">Invite member</h2>
          <form action={inviteAction} className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span>Email</span>
              <input
                name="email"
                type="email"
                required
                className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-3 py-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Role</span>
              <select
                name="accessRole"
                defaultValue="staff"
                className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-3 py-2"
              >
                {access.allowedAssignRoles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="md:col-span-2 grid gap-2 text-sm">
              <legend>Location access</legend>
              <div className="flex flex-wrap gap-3">
                {locations
                  .filter((location) => location.isActive)
                  .map((location) => (
                    <label key={location.locationId} className="flex items-center gap-2">
                      <input type="checkbox" name="locationIds" value={location.locationId} />
                      {location.locationName}
                    </label>
                  ))}
              </div>
            </fieldset>
            {inviteState.error ? (
              <p className="md:col-span-2 text-sm text-red-300">{inviteState.error}</p>
            ) : null}
            {inviteState.success ? (
              <p className="md:col-span-2 text-sm text-emerald-300">{inviteState.success}</p>
            ) : null}
            <button
              type="submit"
              disabled={invitePending}
              className="rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {invitePending ? 'Sending invite…' : 'Send invitation'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="fyh-glass overflow-hidden">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[color:var(--fyh-border)] text-fyh-text-secondary">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Locations</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--fyh-border)]">
            {members.map((member) => (
              <tr key={member.membershipId}>
                <td className="px-4 py-3">
                  <p className="font-medium text-fyh-text">
                    {member.fullName ?? member.email}
                  </p>
                  <p className="text-xs text-fyh-text-muted">{member.email}</p>
                  {member.mobile ? (
                    <p className="text-xs text-fyh-text-muted">{member.mobile}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 capitalize text-fyh-text-secondary">
                  {ROLE_LABEL[member.accessRole] ?? member.accessRole}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      member.isActive
                        ? 'text-emerald-300'
                        : 'text-fyh-text-muted'
                    }
                  >
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-fyh-text-secondary">
                  {member.locationNames.join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {access.canEdit ? (
                    <Link
                      href={`/team/${member.membershipId}`}
                      className="text-sm text-fyh-accent hover:underline"
                    >
                      Manage
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {invitations.length > 0 ? (
        <section className="fyh-glass space-y-3 p-5">
          <h2 className="text-base font-semibold text-fyh-text">Pending invitations</h2>
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="rounded-lg border border-[color:var(--fyh-border)] px-4 py-3 text-sm"
            >
              <p className="font-medium text-fyh-text">{invite.email}</p>
              <p className="text-xs text-fyh-text-muted">
                {ROLE_LABEL[invite.accessRole]} · expires {invite.expiresAt.toLocaleDateString()}
              </p>
              <p className="mt-1 break-all text-xs text-fyh-text-secondary">
                /platform/auth/accept-invite?token={invite.token}
              </p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
