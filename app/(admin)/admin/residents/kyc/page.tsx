import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KycApprovedDocuments } from '@/src/components/admin/KycReviewPanel';
import { KycStorageWarning } from '@/src/components/admin/KycStorageWarning';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCheckCircle } from '@/src/components/admin/icons';
import {
  listApprovedKycSubmissions,
  listPendingKycSubmissions,
} from '@/src/services/kyc';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';

export const dynamic = 'force-dynamic';

export default async function ResidentsKycPage({
  searchParams,
}: {
  searchParams: Promise<{ archive?: string }>;
}) {
  const sp = await searchParams;
  await ensureAdminPageNotificationsSeen('/admin/residents/kyc', '/admin/residents/kyc');

  const [pending, approvedRows] = await Promise.all([
    listPendingKycSubmissions(),
    listApprovedKycSubmissions(),
  ]);

  if (sp.archive === '1') {
    return (
      <>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-lg font-bold text-white">Approved identity documents</h1>
          <Link href="/admin/residents/kyc" className="text-sm font-semibold text-[#FF5A1F] hover:underline">
            ← Review queue
          </Link>
        </div>
        <KycApprovedDocuments rows={approvedRows} />
      </>
    );
  }

  if (pending.length === 0) {
    return (
      <>
        <KycStorageWarning />
        <EmptyState
          icon={<IconCheckCircle />}
          title="No pending identity reviews"
          description="New submissions open here automatically when residents upload from Account → Identity (KYC)."
        />
        {approvedRows.length > 0 ? (
          <p className="mt-6 text-center text-sm text-apg-silver">
            <Link href="/admin/residents/kyc?archive=1" className="font-semibold text-[#FF5A1F] hover:underline">
              View {approvedRows.length} approved on file →
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  redirect(`/admin/residents/kyc/${pending[0]!.id}`);
}
