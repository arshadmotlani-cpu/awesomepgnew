import { KycStorageWarning } from '@/src/components/admin/KycStorageWarning';
import {
  KycApprovedDocuments,
  KycPendingQueue,
  KycReviewTabs,
  type KycReviewTabId,
} from '@/src/components/admin/KycReviewPanel';
import { KycPrimaryActions } from '@/src/components/admin/kyc/KycPrimaryActions';
import { KycQueueAdvancedTools } from '@/src/components/admin/kyc/KycQueueAdvancedTools';
import { KycSummarySection } from '@/src/components/admin/kyc/KycSummarySection';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import {
  listApprovedKycSubmissions,
  listPendingKycSubmissions,
} from '@/src/services/kyc';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';

export const dynamic = 'force-dynamic';

export default async function ResidentsKycPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  await ensureAdminPageNotificationsSeen('/admin/residents/kyc', '/admin/residents/kyc');
  const tab: KycReviewTabId | 'all' =
    sp.tab === 'approved' ? 'approved' : sp.tab === 'pending' ? 'pending' : 'all';

  const [pendingRows, approvedRows] = await Promise.all([
    listPendingKycSubmissions(),
    listApprovedKycSubmissions(),
  ]);

  const showPending = tab === 'all' || tab === 'pending';
  const showApproved = tab === 'all' || tab === 'approved';

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label, href: moduleHref('residents') },
          { label: 'Identity checks' },
        ]}
      />
      <PageHeader
        title="Identity checks"
        description="Review Aadhaar and selfie uploads before residents can check in."
      />

      <div className="mb-6">
        <KycStorageWarning />
      </div>

      <KycSummarySection pendingCount={pendingRows.length} approvedCount={approvedRows.length} />
      <KycPrimaryActions pendingRows={pendingRows} pendingCount={pendingRows.length} />

      <KycReviewTabs
        activeTab={tab === 'all' ? 'pending' : tab}
        showAllTab
        allActive={tab === 'all'}
      />

      <div className="space-y-10">
        {showPending ? (
          <section id="pending">
            <h2 className="mb-3 text-base font-semibold text-white">Needs review</h2>
            <KycPendingQueue rows={pendingRows} />
          </section>
        ) : null}

        {showApproved ? (
          <section id="approved">
            <h2 className="mb-3 text-base font-semibold text-white">Approved on file</h2>
            <KycApprovedDocuments rows={approvedRows} />
          </section>
        ) : null}
      </div>

      <KycQueueAdvancedTools approvedRows={approvedRows} />
    </>
  );
}
