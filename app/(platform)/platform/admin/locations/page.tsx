import Link from 'next/link';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { listAllPlatformLocations } from '@/src/platform/services/admin';

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PlatformLocationsPage() {
  const locations = await listAllPlatformLocations();

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="All salon locations across FYHAIR organizations."
      />
      <DataTable
        rows={locations}
        getRowKey={(row) => row.id}
        emptyMessage="No locations yet."
        columns={[
          { key: 'name', header: 'Location', cell: (row) => row.name },
          {
            key: 'org',
            header: 'Organization',
            cell: (row) => (
              <Link
                href={`/platform/admin/organizations/${row.organizationId}`}
                className="hover:text-[var(--plt-accent)]"
              >
                {row.organizationName}
              </Link>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (row) => (
              <span className="text-xs capitalize text-[var(--plt-text-muted)]">{row.status}</span>
            ),
          },
          {
            key: 'primary',
            header: 'Primary',
            cell: (row) => (row.isPrimary ? 'Yes' : '—'),
          },
          { key: 'address', header: 'Address', cell: (row) => row.address ?? '—' },
          { key: 'created', header: 'Created', cell: (row) => formatDate(row.createdAt) },
        ]}
      />
    </>
  );
}
