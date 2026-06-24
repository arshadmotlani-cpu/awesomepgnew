import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ScrollToHash } from '@/src/components/admin/ScrollToHash';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { OperationsHomeHero } from '@/src/components/admin/residentOps/residents/OperationsHomeHero';
import { ResidentsBlockedPanel } from '@/src/components/admin/residentOps/residents/ResidentsBlockedPanel';
import { ResidentsJourneyStatusPanel } from '@/src/components/admin/residentOps/residents/ResidentsJourneyStatusPanel';
import { ResidentsOperationsActionQueue } from '@/src/components/admin/residentOps/residents/ResidentsOperationsActionQueue';
import { ResidentsOperationsActivityFeed } from '@/src/components/admin/residentOps/residents/ResidentsOperationsActivityFeed';
import { ResidentsOperationsAdvancedTools } from '@/src/components/admin/residentOps/residents/ResidentsOperationsAdvancedTools';
import { ResidentsOperationsCommandCenter } from '@/src/components/admin/residentOps/residents/ResidentsOperationsCommandCenter';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { loadResidentOperationsResidentsPageFromRequest } from '@/src/services/residentOperationsResidentsPage';

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

  return (
    <>
      <ScrollToHash hash="#queue" />
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label, href: ADMIN_MODULES.operations.href },
          { label: 'Resident operations' },
        ]}
      />
      <PageHeader
        title="Operations"
        description="What needs your attention — one action at a time."
      />

      <div className="mt-6">
        <AdminSectionErrorBoundary title="Next action">
          <OperationsHomeHero
            nextItem={data.nextQueueItem}
            queueCount={data.allQueueCount}
          />
        </AdminSectionErrorBoundary>
      </div>

      <div className="mt-8 space-y-2">
        <AdminSectionErrorBoundary title="Operations command center">
          <ResidentsOperationsCommandCenter
            cards={data.commandCards}
            activeFilter={data.activeFilter}
          />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Action queue">
          <ResidentsOperationsActionQueue
            items={data.queue}
            totalCount={data.allQueueCount}
            isSuperAdmin={session.role === 'super_admin'}
          />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Resident journey">
          <ResidentsJourneyStatusPanel stages={data.journeyCounts} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Blocked residents">
          <ResidentsBlockedPanel items={data.blockedResidents} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Recent activity">
          <ResidentsOperationsActivityFeed items={data.recentActivity} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Advanced tools">
          <ResidentsOperationsAdvancedTools />
        </AdminSectionErrorBoundary>
      </div>
    </>
  );
}
