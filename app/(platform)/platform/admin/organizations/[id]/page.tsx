import Link from 'next/link';
import {
  updateOrganizationAction,
  updateOrganizationStatusAction,
  updateSubscriptionAction,
} from '@/src/platform/actions/admin';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { OrgTabNav } from '@/src/platform/components/ui/OrgTabNav';
import { ConfirmSubmitButton } from '@/src/platform/components/ui/ConfirmSubmitButton';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { OrgStatusBadge, SubscriptionStatusBadge } from '@/src/platform/components/ui/StatusBadge';
import {
  listOrganizationDetailsForAdmin,
  listPlatformPlans,
  listPlatformSubscriptionEvents,
} from '@/src/platform/services/admin';

type Props = { params: Promise<{ id: string }> };

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PlatformOrganizationDetailPage({ params }: Props) {
  const { id } = await params;
  const [organization, plans, events] = await Promise.all([
    listOrganizationDetailsForAdmin(id),
    listPlatformPlans(),
    listPlatformSubscriptionEvents({ limit: 10, organizationId: id }),
  ]);

  if (!organization) {
    return (
      <>
        <PageHeader title="Organization not found" />
        <p className="text-sm text-[var(--plt-text-muted)]">The requested organization does not exist.</p>
      </>
    );
  }

  const owner = organization.members.find((m) => m.accessRole === 'owner');

  return (
    <>
      <PageHeader
        title={organization.name}
        subtitle="Organization overview and subscription management."
        breadcrumbs={[
          { label: 'Organizations', href: '/platform/admin/organizations' },
          { label: organization.name },
        ]}
        action={
          <Link href={`/platform/admin/organizations/${organization.id}/members`} className="plt-btn-secondary">
            Invite member
          </Link>
        }
      />
      <OrgTabNav
        organizationId={organization.id}
        organizationName={organization.name}
        activeTab="overview"
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] px-4 py-3">
          <p className="text-xs text-[var(--plt-text-subtle)]">Status</p>
          <div className="mt-1"><OrgStatusBadge status={organization.status} /></div>
        </div>
        <div className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] px-4 py-3">
          <p className="text-xs text-[var(--plt-text-subtle)]">Plan</p>
          <p className="mt-1 text-sm font-medium">{organization.subscription?.planName ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] px-4 py-3">
          <p className="text-xs text-[var(--plt-text-subtle)]">Locations</p>
          <p className="mt-1 text-sm font-medium">{organization.locations.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] px-4 py-3">
          <p className="text-xs text-[var(--plt-text-subtle)]">Members</p>
          <p className="mt-1 text-sm font-medium">{organization.members.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-5">
          <h2 className="text-sm font-semibold mb-4">Organization details</h2>
          <dl className="mb-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--plt-text-subtle)]">Slug</dt>
              <dd>{organization.slug}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--plt-text-subtle)]">Owner</dt>
              <dd>{owner?.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--plt-text-subtle)]">Created</dt>
              <dd>{formatDate(organization.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--plt-text-subtle)]">Subscription</dt>
              <dd>
                {organization.subscription?.status ? (
                  <SubscriptionStatusBadge status={organization.subscription.status} />
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          <form action={updateOrganizationAction} className="grid gap-3 border-t border-[var(--plt-border)] pt-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Name</span>
              <input name="name" defaultValue={organization.name} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Slug</span>
              <input name="slug" type="hidden" value={organization.slug} />
              <p className="rounded-md border border-[var(--plt-border)] bg-black/20 px-3 py-2 font-mono text-sm text-[var(--plt-text-muted)]">
                {organization.slug}
              </p>
              <p className="mt-1 text-xs text-[var(--plt-text-subtle)]">
                Assigned at create and locked (changing it would break existing salon access).
              </p>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Timezone</span>
              <input name="defaultTimezone" defaultValue={organization.defaultTimezone} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">GSTIN</span>
              <input name="gstin" defaultValue={organization.gstin ?? ''} className="plt-input" />
            </label>
            <button type="submit" className="plt-btn-primary w-fit">Save changes</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--plt-border)] pt-4">
            <ConfirmSubmitButton
              action={updateOrganizationStatusAction}
              confirmMessage="Confirm suspend?"
              label="Suspend"
              hiddenFields={{ organizationId: organization.id, status: 'suspended' }}
            />
            {organization.status === 'suspended' ? (
              <form action={updateOrganizationStatusAction}>
                <input type="hidden" name="organizationId" value={organization.id} />
                <input type="hidden" name="status" value="active" />
                <button type="submit" className="plt-btn-secondary">Reactivate</button>
              </form>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-5">
          <h2 className="text-sm font-semibold mb-4">Subscription</h2>
          <form action={updateSubscriptionAction} className="grid gap-3">
            <input type="hidden" name="organizationId" value={organization.id} />
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Plan</span>
              <select name="planId" defaultValue={organization.subscription?.planId ?? ''} className="plt-input">
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Status</span>
              <select name="status" defaultValue={organization.subscription?.status ?? 'trial'} className="plt-input">
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Current period end</span>
              <input
                name="currentPeriodEnd"
                type="date"
                defaultValue={
                  organization.subscription?.currentPeriodEnd
                    ? organization.subscription.currentPeriodEnd.toISOString().slice(0, 10)
                    : ''
                }
                className="plt-input"
              />
            </label>
            <button type="submit" className="plt-btn-primary w-fit">Save subscription</button>
          </form>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-3">Plan & entitlements</h2>
        {organization.entitlements.length === 0 ? (
          <EmptyState title="No entitlements" description="Entitlements are set from the plan at provisioning." />
        ) : (
          <DataTable
            rows={organization.entitlements}
            getRowKey={(row) => row.id}
            columns={[
              { key: 'feature', header: 'Feature', cell: (row) => row.featureKey },
              { key: 'limit', header: 'Limit', cell: (row) => row.limit ?? 'Unlimited' },
            ]}
          />
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-3">Recent activity</h2>
        {events.length === 0 ? (
          <EmptyState title="No activity" />
        ) : (
          <DataTable
            rows={events}
            getRowKey={(row) => row.id}
            columns={[
              { key: 'what', header: 'Action', cell: (row) => row.eventType.replace(/_/g, ' ') },
              { key: 'detail', header: 'Detail', cell: (row) => row.detail ?? '—' },
              { key: 'when', header: 'When', cell: (row) => formatDate(row.createdAt) },
            ]}
          />
        )}
      </section>
    </>
  );
}
