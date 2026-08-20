import Link from 'next/link';
import { updateSubscriptionAction } from '@/src/platform/actions/admin';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { SubscriptionStatusBadge } from '@/src/platform/components/ui/StatusBadge';
import { listPlatformPlans, listPlatformSubscriptions } from '@/src/platform/services/admin';

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PlatformSubscriptionsPage() {
  const [subscriptions, plans] = await Promise.all([
    listPlatformSubscriptions(),
    listPlatformPlans(),
  ]);

  const planLimits = new Map(
    plans.map((p) => [p.id, (p.limits as Record<string, unknown>) ?? {}]),
  );

  return (
    <>
      <PageHeader
        title="Subscriptions"
        subtitle="Manage plan assignment and subscription lifecycle across all organizations."
      />
      <DataTable
        rows={subscriptions}
        getRowKey={(row) => row.id}
        emptyMessage="No subscriptions yet."
        columns={[
          {
            key: 'org',
            header: 'Organization',
            cell: (row) => (
              <Link
                href={`/platform/admin/organizations/${row.organizationId}`}
                className="font-medium hover:text-[var(--plt-accent)]"
              >
                {row.organizationName}
              </Link>
            ),
          },
          { key: 'plan', header: 'Plan', cell: (row) => row.planName },
          {
            key: 'status',
            header: 'Status',
            cell: (row) => <SubscriptionStatusBadge status={row.status} />,
          },
          {
            key: 'start',
            header: 'Start',
            cell: (row) => formatDate(row.currentPeriodStart),
          },
          {
            key: 'end',
            header: 'Period end',
            cell: (row) => formatDate(row.currentPeriodEnd),
          },
          {
            key: 'seats',
            header: 'Seats',
            cell: (row) => {
              const limits = planLimits.get(row.planId);
              const users = limits?.users;
              return typeof users === 'number' ? users : '—';
            },
          },
          {
            key: 'actions',
            header: 'Actions',
            cell: (row) => (
              <form action={updateSubscriptionAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="organizationId" value={row.organizationId} />
                <select name="planId" defaultValue={row.planId} className="plt-input py-1 text-xs max-w-[120px]">
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
                <select name="status" defaultValue={row.status} className="plt-input py-1 text-xs max-w-[100px]">
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <input
                  name="currentPeriodEnd"
                  type="date"
                  defaultValue={
                    row.currentPeriodEnd ? row.currentPeriodEnd.toISOString().slice(0, 10) : ''
                  }
                  className="plt-input py-1 text-xs max-w-[130px]"
                />
                <button type="submit" className="plt-btn-secondary text-xs py-1">Update</button>
              </form>
            ),
          },
        ]}
      />
    </>
  );
}
