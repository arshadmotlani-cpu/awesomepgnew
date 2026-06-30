import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { BillingCommandCards } from '@/src/components/admin/overview/BillingCommandCards';
import { BillingCycleStatusBanner } from '@/src/components/admin/overview/BillingCycleStatusBanner';
import { MorningDashboard } from '@/src/components/admin/work/MorningDashboard';
import {
  buildTodaysWorkCards,
  countNeedsAttention,
  estimateTotalMinutes,
  greetingForHour,
} from '@/src/lib/admin/todaysWorkPresentation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadBillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OverviewPage() {
  const session = await requireAdminSession('/admin/overview');

  let opsPage;
  let settlements;
  let billing;
  try {
    [opsPage, settlements, billing] = await Promise.all([
      loadResidentOperationsResidentsPage(session, null),
      listPipelineCheckoutSettlements(session),
      loadBillingCommandCenterSnapshot(session),
    ]);
  } catch (err) {
    return (
      <>
        <DbStatusBanner
          error={err instanceof Error ? err.message : 'Unable to load today\'s work.'}
        />
      </>
    );
  }

  const cards = buildTodaysWorkCards(opsPage.queue, settlements);
  const attentionCount = countNeedsAttention(cards, {
    hasUnpaidInvoices: billing.hasUnpaidInvoices,
    pendingBillingCount: billing.pendingInvoiceCount,
  });
  const estimatedMinutes = estimateTotalMinutes(
    cards.filter((c) => c.priority !== 'waiting_resident'),
  );
  const hour = new Date().getUTCHours() + 5.5;
  const greeting = greetingForHour(Math.floor(hour) % 24);
  const showCaughtUp = !billing.hasUnpaidInvoices && attentionCount === 0;

  return (
    <AdminSectionErrorBoundary title="Morning dashboard">
      <BillingCycleStatusBanner reconciliation={billing.reconciliation} />
      <MorningDashboard
        greeting={greeting}
        adminName={session.fullName}
        attentionCount={attentionCount}
        estimatedMinutes={estimatedMinutes}
        previewCards={cards.slice(0, 6)}
        operationsHref="/admin/operations/residents"
        billingCards={<BillingCommandCards cards={billing.cards} />}
        showCaughtUp={showCaughtUp}
      />
    </AdminSectionErrorBoundary>
  );
}
