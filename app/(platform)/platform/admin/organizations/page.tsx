import Link from 'next/link';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { OrgStatusBadge, SubscriptionStatusBadge } from '@/src/platform/components/ui/StatusBadge';
import {
  listOrganizationsForPlatformAdminFiltered,
  listPlatformPlans,
} from '@/src/platform/services/admin';

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    plan?: string;
    sort?: string;
  }>;
};

export default async function PlatformOrganizationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const sort = (params.sort as 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc') ?? 'created_desc';
  const [organizations, plans] = await Promise.all([
    listOrganizationsForPlatformAdminFiltered({
      q: params.q,
      status: params.status,
      planId: params.plan,
      sort,
    }),
    listPlatformPlans(),
  ]);

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Manage every business using FYHAIR."
        action={
          <Link href="/platform/admin/onboarding" className="plt-btn-primary">
            + Create organization
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap gap-3 items-end" method="get">
        <label className="grid gap-1 text-xs text-[var(--plt-text-subtle)] min-w-[200px] flex-1">
          Search
          <input
            name="q"
            value={params.q ?? ''}
            placeholder="Name or slug…"
            className="plt-input"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--plt-text-subtle)]">
          Status
          <select name="status" value={params.status ?? ''} className="plt-input">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--plt-text-subtle)]">
          Plan
          <select name="plan" value={params.plan ?? ''} className="plt-input">
            <option value="">All plans</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--plt-text-subtle)]">
          Sort
          <select name="sort" value={sort} className="plt-input">
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </label>
        <button type="submit" className="plt-btn-secondary">Apply</button>
      </form>

      <DataTable
        rows={organizations}
        getRowKey={(row) => row.id}
        emptyMessage="No organizations match your filters."
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
            key: 'subscription',
            header: 'Subscription',
            cell: (row) =>
              row.subscriptionStatus ? (
                <SubscriptionStatusBadge status={row.subscriptionStatus} />
              ) : (
                '—'
              ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (row) => <OrgStatusBadge status={row.status} />,
          },
          { key: 'created', header: 'Created', cell: (row) => formatDate(row.createdAt) },
          {
            key: 'actions',
            header: '',
            cell: (row) => (
              <Link href={`/platform/admin/organizations/${row.id}`} className="text-xs text-[var(--plt-accent)] hover:underline">
                View
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
