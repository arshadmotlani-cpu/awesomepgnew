import { DepositManagementPanel } from '@/src/components/admin/deposits/DepositManagementPanel';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { listDepositInvoiceRecords } from '@/src/services/depositInvoices';

export const dynamic = 'force-dynamic';

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  await ensureAdminPageNotificationsSeen('/admin/deposits', '/admin/deposits');
  const view = sp.view === 'settled' ? 'settled' : 'active';

  let rows: Awaited<ReturnType<typeof listDepositInvoiceRecords>> = [];
  let error: string | null = null;
  try {
    rows = await listDepositInvoiceRecords({ view });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not load deposit invoices.';
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.deposits.label },
        ]}
      />

      {error ? (
        <DbStatusBanner error={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title={view === 'settled' ? 'No settled deposit invoices' : 'No active deposit invoices'}
          description={
            view === 'settled'
              ? 'Completed refund settlements appear here after residents vacate.'
              : 'Active residents with a deposit requirement appear here as one computed invoice each.'
          }
        />
      ) : (
        <DepositManagementPanel rows={rows} view={view} />
      )}
    </>
  );
}
