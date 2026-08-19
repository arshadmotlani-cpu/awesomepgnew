import { inviteMemberAction, updateMemberAction } from '@/src/platform/actions/admin';
import { PlatformAdminShell } from '@/src/platform/components/PlatformAdminShell';
import { listOrganizationDetailsForAdmin } from '@/src/platform/services/admin';

type Props = { params: Promise<{ id: string }> };

const ACCESS_ROLES = ['owner', 'co_owner', 'manager', 'biller', 'staff'] as const;

export default async function PlatformOrganizationMembersPage({ params }: Props) {
  const { id } = await params;
  const organization = await listOrganizationDetailsForAdmin(id);
  if (!organization) {
    return (
      <PlatformAdminShell title="Organization not found">
        <p className="text-sm text-slate-400">The requested organization does not exist.</p>
      </PlatformAdminShell>
    );
  }

  return (
    <PlatformAdminShell title={`${organization.name} members`}>
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form action={inviteMemberAction} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <input type="hidden" name="organizationId" value={organization.id} />
          <h2 className="text-base font-semibold">Invite member</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Email</span>
              <input name="email" type="email" required className="rounded-lg bg-slate-950 px-3 py-2" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Access role</span>
              <select name="accessRole" defaultValue="staff" className="rounded-lg bg-slate-950 px-3 py-2">
                {ACCESS_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-2 text-sm">
              <legend>Location access</legend>
              {organization.locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="locationIds"
                    value={location.id}
                    defaultChecked={location.isPrimary}
                  />
                  {location.name}
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Create invite
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {organization.members.map((member) => (
            <form
              key={member.id}
              action={updateMemberAction}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <input type="hidden" name="organizationId" value={organization.id} />
              <input type="hidden" name="membershipId" value={member.id} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{member.email}</p>
                  <p className="text-xs text-slate-500">
                    Role column: {member.role} · Access role: {member.accessRole}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input name="isActive" type="checkbox" defaultChecked={member.isActive} />
                  Active
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span>Access role</span>
                  <select
                    name="accessRole"
                    defaultValue={member.accessRole}
                    className="rounded-lg bg-slate-950 px-3 py-2"
                  >
                    {ACCESS_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="grid gap-2 text-sm">
                  <legend>Location access</legend>
                  {organization.locations.map((location) => (
                    <label key={location.id} className="flex items-center gap-2">
                      <input type="checkbox" name="locationIds" value={location.id} defaultChecked />
                      {location.name}
                    </label>
                  ))}
                </fieldset>
              </div>
              <button
                type="submit"
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Save member
              </button>
            </form>
          ))}
        </div>
      </div>
    </PlatformAdminShell>
  );
}
