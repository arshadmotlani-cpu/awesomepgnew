import Link from 'next/link';
import { updatePlatformUserAction } from '@/src/platform/actions/admin';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { PlatformAdminBadge, UserStatusBadge } from '@/src/platform/components/ui/StatusBadge';
import { RoleBadge } from '@/src/platform/components/ui/RoleBadge';
import { listPlatformUsers, listUserOrganizationMemberships } from '@/src/platform/services/admin';

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type Props = { searchParams: Promise<{ filter?: string }> };

export default async function PlatformUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const isPlatformAdminFilter = params.filter === 'platform_admin';
  const allUsers = await listPlatformUsers();
  const users = isPlatformAdminFilter
    ? allUsers.filter((u) => u.isPlatformAdmin)
    : allUsers;
  const memberships = await listUserOrganizationMemberships(users.map((u) => u.id));

  return (
    <>
      <PageHeader
        title={isPlatformAdminFilter ? 'Platform administrators' : 'Users'}
        subtitle={
          isPlatformAdminFilter
            ? 'SaaS-owner administrators with access to this console. Not salon organization roles.'
            : 'Platform users and their organization memberships.'
        }
      />

      <div className="mb-4 flex gap-2">
        <Link
          href="/platform/admin/users"
          className={[
            'px-3 py-1.5 text-xs rounded-md border',
            !isPlatformAdminFilter
              ? 'border-[var(--plt-accent)] text-[var(--plt-accent)] bg-[var(--plt-accent)]/10'
              : 'border-[var(--plt-border)] text-[var(--plt-text-muted)]',
          ].join(' ')}
        >
          All users
        </Link>
        <Link
          href="/platform/admin/users?filter=platform_admin"
          className={[
            'px-3 py-1.5 text-xs rounded-md border',
            isPlatformAdminFilter
              ? 'border-[var(--plt-accent)] text-[var(--plt-accent)] bg-[var(--plt-accent)]/10'
              : 'border-[var(--plt-border)] text-[var(--plt-text-muted)]',
          ].join(' ')}
        >
          Platform administrators
        </Link>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title={isPlatformAdminFilter ? 'No platform administrators' : 'No users'}
          description={
            isPlatformAdminFilter
              ? 'Grant platform admin access from the All users tab.'
              : 'Users appear when organizations are onboarded or invitations are accepted.'
          }
        />
      ) : (
        <div className="space-y-4">
          {users.map((user) => {
            const orgs = memberships[user.id] ?? [];
            return (
              <form
                key={user.id}
                action={updatePlatformUserAction}
                className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-4"
              >
                <input type="hidden" name="userId" value={user.id} />
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-medium text-sm">{user.email}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <UserStatusBadge status={user.status} />
                      {user.isPlatformAdmin ? <PlatformAdminBadge /> : null}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--plt-text-subtle)]">
                    Created {formatDate(user.createdAt)}
                  </p>
                </div>
                {orgs.length > 0 ? (
                  <div className="mb-3 text-xs text-[var(--plt-text-muted)]">
                    <span className="text-[var(--plt-text-subtle)]">Organizations: </span>
                    {orgs.map((o, i) => (
                      <span key={i}>
                        {o.organizationName} (<RoleBadge role={o.role} />)
                        {i < orgs.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-[var(--plt-text-subtle)]">No organization memberships</p>
                )}
                <div className="flex flex-wrap items-end gap-4 border-t border-[var(--plt-border)] pt-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-[var(--plt-text-muted)]">Status</span>
                    <select name="status" defaultValue={user.status} className="plt-input max-w-[140px]">
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="invited">Invited</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isPlatformAdmin"
                      defaultChecked={user.isPlatformAdmin}
                    />
                    <span className="text-[var(--plt-text-muted)]">Platform administrator</span>
                  </label>
                  <button type="submit" className="plt-btn-secondary">Save user</button>
                </div>
              </form>
            );
          })}
        </div>
      )}

      {!isPlatformAdminFilter ? (
        <div className="mt-6 rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-4 text-xs text-[var(--plt-text-muted)]">
          <p className="font-medium text-[var(--plt-text)] mb-2">Organization roles (salon access)</p>
          <ul className="space-y-1">
            <li><strong>Owner</strong> — Full organization access</li>
            <li><strong>Co-owner</strong> — Full organization access except platform administration</li>
            <li><strong>Manager</strong> — Manage staff/team and operational areas per permissions</li>
            <li><strong>Biller</strong> — Billing, appointments, and payment operations only</li>
            <li><strong>Staff</strong> — Own appointments, services, and permitted operational information</li>
          </ul>
          <p className="mt-2 text-[var(--plt-text-subtle)]">
            Platform Administrator is not an organization role. Salons cannot create platform administrators.
          </p>
        </div>
      ) : null}
    </>
  );
}
