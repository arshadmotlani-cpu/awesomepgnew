import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { EmptyState } from '@/src/platform/components/ui/EmptyState';
import { listPlatformSubscriptionEvents } from '@/src/platform/services/admin';

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PlatformActivityPage() {
  const events = await listPlatformSubscriptionEvents({ limit: 100 });

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle="Subscription and provisioning events across the platform. This is not a full audit log."
      />
      {events.length === 0 ? (
        <EmptyState
          title="No events recorded"
          description="Activity appears when organizations are created, subscriptions change, or invitations are accepted."
        />
      ) : (
        <DataTable
          rows={events}
          getRowKey={(row) => row.id}
          columns={[
            {
              key: 'who',
              header: 'Who',
              cell: (row) => row.actorEmail ?? (row.actorUserId ? 'System' : '—'),
            },
            {
              key: 'what',
              header: 'Action',
              cell: (row) => row.eventType.replace(/_/g, ' '),
            },
            { key: 'org', header: 'Organization', cell: (row) => row.organizationName },
            { key: 'detail', header: 'Detail', cell: (row) => row.detail ?? '—' },
            { key: 'when', header: 'When', cell: (row) => formatDate(row.createdAt) },
          ]}
        />
      )}
    </>
  );
}
