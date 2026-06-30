import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { MorningDashboard } from '@/src/components/admin/work/MorningDashboard';
import {
  buildTodaysWorkCards,
  countNeedsAttention,
  estimateTotalMinutes,
  greetingForHour,
} from '@/src/lib/admin/todaysWorkPresentation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OverviewPage() {
  const session = await requireAdminSession('/admin/overview');

  let opsPage;
  let settlements;
  try {
    [opsPage, settlements] = await Promise.all([
      loadResidentOperationsResidentsPage(session, null),
      listPipelineCheckoutSettlements(session),
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
  const attentionCount = countNeedsAttention(cards);
  const estimatedMinutes = estimateTotalMinutes(
    cards.filter((c) => c.priority !== 'waiting_resident'),
  );
  const hour = new Date().getUTCHours() + 5.5; // IST offset approx
  const greeting = greetingForHour(Math.floor(hour) % 24);

  return (
    <AdminSectionErrorBoundary title="Morning dashboard">
      <MorningDashboard
        greeting={greeting}
        adminName={session.fullName}
        attentionCount={attentionCount}
        estimatedMinutes={estimatedMinutes}
        previewCards={cards.slice(0, 6)}
        operationsHref="/admin/operations/residents"
      />
    </AdminSectionErrorBoundary>
  );
}
