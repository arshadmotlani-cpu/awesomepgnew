import Link from 'next/link';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { MetricGrid, MetricTile } from '@/src/platform/components/ui/MetricTile';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { OrgStatusBadge, SubscriptionStatusBadge } from '@/src/platform/components/ui/StatusBadge';
import {
  getOrganizationsNeedingAttention,
  getPlatformDashboardStats,
} from '@/src/platform/services/admin';
import { getPlatformSession } from '@/src/platform/lib/auth/session';

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function greetingName(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.replace(/[._]/g, ' ');
}

export default async function PlatformAdminHomePage() {
  const session = await getPlatformSession();
  const [stats, attention] = await Promise.all([
    getPlatformDashboardStats(),
    getOrganizationsNeedingAttention(),
  ]);
  const email = session?.email ?? 'Administrator';

  return (
    <>
      <PageHeader
        title={`Good morning, ${greetingName(email)}`}
        subtitle="Here's what's happening across FYHAIR."
        action={
          <Link href="/platform/admin/onboarding" className="plt-btn-primary">
            + Create organization
          </Link>
        }
      />

      <MetricGrid>
        <MetricTile label="Total organizations" value={stats.totalOrganizations} />
        <MetricTile label="Active organizations" value={stats.activeOrganizations} />
        <MetricTile label="Trial organizations" value={stats.trialOrganizations} />
        <MetricTile
          label="MRR"
          value="—"
          hint="Pricing not configured in plan catalog"
        />
        <MetricTile
          label="Past due"
          value={stats.subscriptionsByStatus.past_due ?? 0}
        />
        <MetricTile
          label="Suspended subs"
          value={stats.subscriptionsByStatus.suspended ?? 0}
        />
        <MetricTile label="Total locations" value={stats.totalLocations} />
        <MetricTile label="Total users" value={stats.totalUsers} />
      </MetricGrid>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Organizations requiring attention</h2>
          </div>
          {attention.length === 0 ? (
            <EmptyState
              title="All clear"
              description="No organizations need immediate attention."
            />
          ) : (
            <DataTable
              rows={attention}
              getRowKey={(row) => `${row.organizationId}-${row.reason}`}
              columns={[
                {
                  key: 'org',
                  header: 'Organization',
                  cell: (row) => (
                    <Link
                      href={`/platform/admin/organizations/${row.organizationId}`}
                      className="font-medium text-[var(--plt-accent)] hover:underline"
                    >
                      {row.organizationName}
                    </Link>
                  ),
                },
                { key: 'reason', header: 'Issue', cell: (row) => row.reason },
                {
                  key: 'severity',
                  header: 'Severity',
                  cell: (row) => (
                    <span
                      className={
                        row.severity === 'critical'
                          ? 'text-red-400 text-xs font-medium'
                          : 'text-amber-400 text-xs font-medium'
                      }
                    >
                      {row.severity}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Subscription overview</h2>
            <p className="text-xs text-[var(--plt-text-subtle)]">By subscription status</p>
          </div>
          {Object.keys(stats.subscriptionsByStatus).length === 0 ? (
            <EmptyState title="No subscriptions" description="Subscriptions appear when organizations are onboarded." />
          ) : (
            <div className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-4 space-y-3">
              {Object.entries(stats.subscriptionsByStatus).map(([status, count]) => {
                const total = stats.totalOrganizations || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={status}>
                    <div className="flex justify-between text-xs mb-1">
                      <SubscriptionStatusBadge status={status} />
                      <span className="text-[var(--plt-text-muted)]">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-[var(--plt-accent)]/60"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Recent organizations</h2>
            <p className="text-xs text-[var(--plt-text-subtle)]">Latest salons on FYHAIR</p>
          </div>
          <Link href="/platform/admin/organizations" className="text-xs text-[var(--plt-accent)] hover:underline">
            View all
          </Link>
        </div>
        <DataTable
          rows={stats.recentOrganizations}
          getRowKey={(row) => row.id}
          emptyMessage="No organizations yet."
          columns={[
            {
              key: 'name',
              header: 'Organization',
              cell: (row) => (
                <Link href={`/platform/admin/organizations/${row.id}`} className="font-medium hover:text-[var(--plt-accent)]">
                  {row.name}
                </Link>
              ),
            },
            { key: 'owner', header: 'Owner', cell: (row) => row.ownerEmail ?? '—' },
            { key: 'plan', header: 'Plan', cell: (row) => row.planName ?? '—' },
            { key: 'locations', header: 'Locations', cell: (row) => row.locationCount },
            { key: 'users', header: 'Users', cell: (row) => row.memberCount },
            {
              key: 'status',
              header: 'Status',
              cell: (row) => <OrgStatusBadge status={row.status} />,
            },
            { key: 'created', header: 'Created', cell: (row) => formatDate(row.createdAt) },
          ]}
        />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Recent platform activity</h2>
            <p className="text-xs text-[var(--plt-text-subtle)]">Subscription & provisioning events</p>
          </div>
          <Link href="/platform/admin/activity" className="text-xs text-[var(--plt-accent)] hover:underline">
            View all
          </Link>
        </div>
        {stats.recentSubscriptionActivity.length === 0 ? (
          <EmptyState title="No activity yet" description="Events appear when organizations are provisioned or subscriptions change." />
        ) : (
          <DataTable
            rows={stats.recentSubscriptionActivity}
            getRowKey={(row) => row.id}
            columns={[
              { key: 'what', header: 'Action', cell: (row) => row.eventType.replace(/_/g, ' ') },
              { key: 'org', header: 'Organization', cell: (row) => row.organizationName },
              { key: 'detail', header: 'Detail', cell: (row) => row.detail ?? '—' },
              { key: 'when', header: 'When', cell: (row) => formatDate(row.createdAt) },
            ]}
          />
        )}
      </section>
    </>
  );
}
