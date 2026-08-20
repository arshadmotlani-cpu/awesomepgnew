import {
  inviteMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateMemberAction,
} from '@/src/platform/actions/admin';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { OrgTabNav } from '@/src/platform/components/ui/OrgTabNav';
import { ConfirmSubmitButton } from '@/src/platform/components/ui/ConfirmSubmitButton';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { InvitationStatusBadge } from '@/src/platform/components/ui/StatusBadge';
import { RoleBadge, RoleDescription } from '@/src/platform/components/ui/RoleBadge';
import { listOrganizationDetailsForAdmin } from '@/src/platform/services/admin';

type Props = { params: Promise<{ id: string }> };

const ACCESS_ROLES = ['owner', 'co_owner', 'manager', 'biller', 'staff'] as const;

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PlatformOrganizationMembersPage({ params }: Props) {
  const { id } = await params;
  const organization = await listOrganizationDetailsForAdmin(id);
  if (!organization) {
    return (
      <>
        <PageHeader title="Organization not found" />
        <p className="text-sm text-[var(--plt-text-muted)]">The requested organization does not exist.</p>
      </>
    );
  }

  const locationName = (locationId: string) =>
    organization.locations.find((l) => l.id === locationId)?.name ?? locationId;

  return (
    <>
      <PageHeader
        title={organization.name}
        subtitle="Members and invitations"
        breadcrumbs={[
          { label: 'Organizations', href: '/platform/admin/organizations' },
          { label: organization.name, href: `/platform/admin/organizations/${organization.id}` },
          { label: 'Members' },
        ]}
      />
      <OrgTabNav
        organizationId={organization.id}
        organizationName={organization.name}
        activeTab="members"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <form
          action={inviteMemberAction}
          className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-5"
        >
          <input type="hidden" name="organizationId" value={organization.id} />
          <h2 className="text-sm font-semibold">Invite member</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Email</span>
              <input name="email" type="email" required className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Access role</span>
              <select name="accessRole" defaultValue="staff" className="plt-input">
                {ACCESS_ROLES.map((role) => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-2 text-sm">
              <legend className="text-[var(--plt-text-muted)]">Location access</legend>
              {organization.locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2">
                  <input type="checkbox" name="locationIds" value={location.id} defaultChecked={location.isPrimary} />
                  {location.name}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="plt-btn-primary w-fit">Send invitation</button>
          </div>
        </form>

        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold mb-3">Members</h2>
            {organization.members.length === 0 ? (
              <EmptyState title="No members" />
            ) : (
              <div className="space-y-3">
                {organization.members.map((member) => (
                  <form
                    key={member.id}
                    action={updateMemberAction}
                    className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-4"
                  >
                    <input type="hidden" name="organizationId" value={organization.id} />
                    <input type="hidden" name="membershipId" value={member.id} />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{member.email}</p>
                        <RoleBadge role={member.accessRole} />
                        <RoleDescription role={member.accessRole} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input name="isActive" type="checkbox" defaultChecked={member.isActive} />
                        Active
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span className="text-[var(--plt-text-muted)]">Access role</span>
                        <select name="accessRole" defaultValue={member.accessRole} className="plt-input">
                          {ACCESS_ROLES.map((role) => (
                            <option key={role} value={role}>{role.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="grid gap-1 text-sm">
                        <legend className="text-[var(--plt-text-muted)]">Locations</legend>
                        {organization.locations.map((location) => (
                          <label key={location.id} className="flex items-center gap-2">
                            <input type="checkbox" name="locationIds" value={location.id} defaultChecked />
                            {location.name}
                          </label>
                        ))}
                      </fieldset>
                    </div>
                    <button type="submit" className="plt-btn-secondary mt-3">Save member</button>
                  </form>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Invitations</h2>
            {organization.invitations.length === 0 ? (
              <EmptyState title="No invitations" />
            ) : (
              <DataTable
                rows={organization.invitations}
                getRowKey={(row) => row.id}
                columns={[
                  { key: 'email', header: 'Email', cell: (row) => row.email },
                  { key: 'role', header: 'Role', cell: (row) => <RoleBadge role={row.accessRole} /> },
                  {
                    key: 'locations',
                    header: 'Locations',
                    cell: (row) =>
                      (row.locationIds ?? []).map(locationName).join(', ') || '—',
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (row) => <InvitationStatusBadge status={row.status} />,
                  },
                  { key: 'invited', header: 'Invited', cell: (row) => formatDate(row.createdAt) },
                  {
                    key: 'actions',
                    header: '',
                    cell: (row) =>
                      row.status === 'pending' ? (
                        <div className="flex gap-2">
                          <form action={resendInvitationAction}>
                            <input type="hidden" name="invitationId" value={row.id} />
                            <input type="hidden" name="organizationId" value={organization.id} />
                            <button type="submit" className="text-xs text-[var(--plt-accent)] hover:underline">
                              Resend
                            </button>
                          </form>
                          <ConfirmSubmitButton
                            action={revokeInvitationAction}
                            confirmMessage="Revoke?"
                            label="Revoke"
                            className="text-xs text-red-400 hover:underline bg-transparent border-none p-0"
                            hiddenFields={{
                              invitationId: row.id,
                              organizationId: organization.id,
                            }}
                          />
                        </div>
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
