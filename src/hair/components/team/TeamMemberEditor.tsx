'use client';

import Link from 'next/link';
import { updateTeamMemberAction } from '@/src/hair/actions/team';
import type { TeamManagementAccess } from '@/src/hair/lib/auth/teamManagementAccess';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import type { TeamLocationOption, TeamMemberRow } from '@/src/hair/services/team';

const ROLE_LABEL: Record<PlatformMembershipRole, string> = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  manager: 'Manager',
  biller: 'Biller',
  staff: 'Staff',
};

export function TeamMemberEditor({
  member,
  locations,
  access,
  error,
}: {
  member: TeamMemberRow;
  locations: TeamLocationOption[];
  access: TeamManagementAccess;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/team" className="text-sm text-fyh-accent hover:underline">
          ← Back to team
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-fyh-text">
          {member.fullName ?? member.email}
        </h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">{member.email}</p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <form action={updateTeamMemberAction} className="fyh-glass grid gap-4 p-5 md:grid-cols-2">
        <input type="hidden" name="membershipId" value={member.membershipId} />
        <label className="grid gap-2 text-sm">
          <span>Full name</span>
          <input
            name="fullName"
            defaultValue={member.fullName ?? ''}
            className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-3 py-2"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Mobile</span>
          <input
            name="mobile"
            defaultValue={member.mobile ?? ''}
            className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-3 py-2"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span>Role</span>
          <select
            name="accessRole"
            defaultValue={member.accessRole}
            className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg)] px-3 py-2"
          >
            {access.allowedAssignRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={member.isActive}
            disabled={member.membershipId === access.membershipId}
          />
          Active member
        </label>
        <fieldset className="md:col-span-2 grid gap-2 text-sm">
          <legend>Location access</legend>
          <div className="flex flex-wrap gap-3">
            {locations
              .filter((location) => location.isActive)
              .map((location) => (
                <label key={location.locationId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="locationIds"
                    value={location.locationId}
                    defaultChecked={member.locationIds.includes(location.locationId)}
                  />
                  {location.locationName}
                </label>
              ))}
          </div>
        </fieldset>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Save member
          </button>
        </div>
      </form>
    </div>
  );
}
