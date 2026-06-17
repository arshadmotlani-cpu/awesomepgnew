import { DepositManagementPanel } from '@/src/components/admin/deposits/DepositManagementPanel';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { listAdminDepositSummaries } from '@/src/db/queries/admin';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';

export const dynamic = 'force-dynamic';

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  await ensureAdminPageNotificationsSeen('/admin/deposits', '/admin/deposits');
  const dueOnly = sp.filter === 'due';
  const res = await listAdminDepositSummaries();
  const { listOutstandingDeposits } = await import('@/src/services/depositCollection');
  const outstanding = dueOnly ? await listOutstandingDeposits() : [];
  const outstandingIds = new Set(outstanding.map((r) => r.bookingId));

  const tableRows =
    res.ok && dueOnly
      ? res.data.filter((r) => outstandingIds.has(r.bookingId))
      : res.ok
        ? res.data
        : [];

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.deposits.label },
        ]}
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No deposit bookings yet"
          description="Confirmed bookings with a deposit requirement appear here, even before the first ledger entry."
        />
      ) : (
        <DepositManagementPanel rows={tableRows} dueOnly={dueOnly} />
      )}
    </>
  );
}
