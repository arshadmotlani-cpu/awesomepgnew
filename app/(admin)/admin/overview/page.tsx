import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ControlBoard } from '@/src/components/admin/ControlBoard';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { SyncActionsButton } from '@/src/components/admin/SyncActionsButton';
import { UnreadNotificationsPanel } from '@/src/components/admin/UnreadNotificationsPanel';
import { OverviewGlobalSummary } from '@/src/components/admin/overview/OverviewGlobalSummary';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { buildControlBoardData } from '@/src/services/controlBoard';
import { runOperatorTestDataCleanup } from '@/src/services/operatorTestDataCleanup';
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

  const ctx = await loadOverviewContext(session, billingMonth);

  if (!ctx.ok) {
    return (
      <>
        <PageHeader title="Overview" description="Platform summary — drill into modules for detail." />
        <DbStatusBanner error={ctx.error} />
      </>
    );
  }

  const controlBoard = buildControlBoardData({
    billingMonth: ctx.data.billingMonth,
    monthLabel: ctx.data.monthLabel,
    summary: ctx.data.summary,
    pgMetrics: ctx.data.pgMetrics,
    revenue: ctx.data.revenue,
    operations: ctx.data.operations,
    dashboard: ctx.data.dashboard,
    rentStats: ctx.data.rentStats,
    overviewKpis: ctx.data.overviewKpis,
    visitors: ctx.data.visitors,
    actionItems: ctx.data.actionItems,
    depositByPg: new Map(),
  });

  return (
    <>
      <PageHeader
        title="Overview"
        description="Layer 1 — global KPIs only. Each metric opens a dedicated module route."
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
        <OverviewGlobalSummary ctx={ctx.data} />
      </AdminSectionErrorBoundary>

      <AdminSectionErrorBoundary title="Control board">
        <section className="mt-10">
          <h2 className="mb-1 text-sm font-semibold text-white">Control board</h2>
          <p className="mb-4 text-xs text-apg-silver">
            Live metrics — click any card to drill down and act (WhatsApp, payment links, bulk reminders).
          </p>
          <ControlBoard
            cards={controlBoard.cards}
            billingMonth={ctx.data.billingMonth}
            monthLabel={ctx.data.monthLabel}
          />
        </section>
      </AdminSectionErrorBoundary>
    </>
  );
}
