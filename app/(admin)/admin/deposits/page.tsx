import Link from 'next/link';
import { DepositManagementPanel } from '@/src/components/admin/deposits/DepositManagementPanel';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
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
      <PageHeader
        title="Deposit management"
        description="Every booking with a security deposit — required amount, collection status, ledger balance, and refunds."
        actions={
          <Link
            href="/admin/deposits/add"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add deposit
          </Link>
        }
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
