import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { SyncActionsButton } from '@/src/components/admin/SyncActionsButton';
import { UnreadNotificationsPanel } from '@/src/components/admin/UnreadNotificationsPanel';
import { OutstandingDepositsPanel } from '@/src/components/admin/overview/OutstandingDepositsPanel';
import { OverviewDashboard } from '@/src/components/admin/overview/OverviewDashboard';
import { PendingActionItemsOverview } from '@/src/components/admin/overview/PendingActionItemsOverview';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { runOperatorTestDataCleanup } from '@/src/services/operatorTestDataCleanup';
import { buildOverviewDashboard } from '@/src/services/overviewDashboard';
import { loadOverviewContext } from '@/src/services/overviewData';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    clearTestExtraIncome?: string;
    extraIncomeCleared?: string;
    removedPaise?: string;
  }>;
}) {
  const sp = await searchParams;

  if (sp.clearTestExtraIncome === '1') {
    await requireAdminSession('/admin/overview?clearTestExtraIncome=1');
    const result = await runOperatorTestDataCleanup();
    revalidatePath('/admin/overview');
    revalidatePath('/admin/deposits');
    const month = resolveBillingMonth(sp.month);
    redirect(
      `/admin/overview?month=${month}&extraIncomeCleared=1&removedPaise=${result.removedDeductionPaise}`,
    );
  }

  const billingMonth = resolveBillingMonth(sp.month);
  const session = await requireAdminSession('/admin/overview');

  const ctx = await loadOverviewContext(session, billingMonth, { syncActions: false });

  if (!ctx.ok) {
    return (
      <>
        <PageHeader title="Overview" description="Platform summary — drill into modules for detail." />
        <DbStatusBanner error={ctx.error} />
      </>
    );
  }

  const dashboard = buildOverviewDashboard(ctx.data);

  return (
    <>
      <PageHeader
        title="Overview Dashboard"
        description="Money, collections, occupancy, and operations — each metric links to its module."
        actions={
          <div className="flex items-center gap-2">
            <SyncActionsButton />
            <OverviewMonthPicker billingMonth={billingMonth} />
          </div>
        }
      />

      {sp.extraIncomeCleared === '1' ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Removed June test deposit deductions
          {sp.removedPaise ? ` (₹${Number(sp.removedPaise) / 100})` : ''}.
        </div>
      ) : null}

      <AdminSectionErrorBoundary title="Overview summary">
        <div className="mb-8">
          <UnreadNotificationsPanel items={ctx.data.unreadNotifications} />
        </div>
        <div className="mb-8">
          <OutstandingDepositsPanel rows={ctx.data.outstandingDeposits} />
        </div>
        <div className="mb-8">
          <PendingActionItemsOverview items={ctx.data.oldestPendingActions} />
        </div>
        <OverviewDashboard data={dashboard} />
      </AdminSectionErrorBoundary>
    </>
  );
}
