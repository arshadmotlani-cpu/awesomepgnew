import { KycStorageWarning } from '@/src/components/admin/KycStorageWarning';
import {
  KycApprovedDocuments,
  KycPendingQueue,
  KycReviewTabs,
  type KycReviewTabId,
} from '@/src/components/admin/KycReviewPanel';
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
          { label: 'KYC review' },
        ]}
      />
      <PageHeader
        title="KYC review"
        description="Pending submissions need Verify → approve. Approved documents stay below with photos on file."
      />

      <div className="mb-6">
        <KycStorageWarning />
      </div>

      <KycReviewTabs
        activeTab={tab === 'all' ? 'pending' : tab}
        pendingCount={pendingRows.length}
        approvedCount={approvedRows.length}
        showAllTab
        allActive={tab === 'all'}
      />

      <div className="space-y-10">
        {showPending ? (
          <section id="pending">
            <h2 className="mb-3 text-sm font-semibold text-white">
              Pending approval ({pendingRows.length})
            </h2>
            <KycPendingQueue rows={pendingRows} />
          </section>
        ) : null}

        {showApproved ? (
          <section id="approved">
            <h2 className="mb-3 text-sm font-semibold text-white">
              Approved documents ({approvedRows.length})
            </h2>
            <KycApprovedDocuments rows={approvedRows} />
          </section>
        ) : null}
      </div>
    </>
  );
}
