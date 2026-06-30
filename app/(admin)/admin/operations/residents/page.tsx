import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { TodaysWorkPage } from '@/src/components/admin/work/TodaysWorkPage';
import {
  buildTodaysWorkCards,
  countNeedsAttention,
  estimateTotalMinutes,
} from '@/src/lib/admin/todaysWorkPresentation';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadResidentOperationsResidentsPageFromRequest } from '@/src/services/residentOperationsResidentsPage';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function ResidentOperationsResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  if (params.filter === 'payment_proof') {
    redirect('/admin/operations/payment-reviews');
  }

  await ensureAdminPageNotificationsSeen(
    '/admin/operations/residents',
    '/admin/operations/residents',
  );

  const { session, data } = await loadResidentOperationsResidentsPageFromRequest(params.filter);
  const settlements = await listPipelineCheckoutSettlements(session);
  const cards = buildTodaysWorkCards(data.queue, settlements);
  const attentionCount = countNeedsAttention(cards);
  const estimatedMinutes = estimateTotalMinutes(
    cards.filter((c) => c.priority !== 'waiting_resident'),
  );

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label, href: ADMIN_MODULES.operations.href },
          { label: "Today's work" },
        ]}
      />

      <AdminSectionErrorBoundary title="Today's work">
        <TodaysWorkPage
          cards={cards}
          estimatedMinutes={estimatedMinutes}
          attentionCount={attentionCount}
        />
      </AdminSectionErrorBoundary>
    </>
  );
}
