import { notFound, redirect } from 'next/navigation';
import { KycReviewWorkspace } from '@/src/components/admin/kyc/KycReviewWorkspace';
import { KycStorageWarning } from '@/src/components/admin/KycStorageWarning';
import { getKycReviewContext, listPendingKycSubmissions } from '@/src/services/kyc';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';

export const dynamic = 'force-dynamic';

export default async function ResidentsKycVerifyPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  await ensureAdminPageNotificationsSeen(
    `/admin/residents/kyc/${submissionId}`,
    `/admin/residents/kyc/${submissionId}`,
  );

  const [ctx, pending] = await Promise.all([
    getKycReviewContext(submissionId),
    listPendingKycSubmissions(),
  ]);
  if (!ctx) notFound();

  const pendingIds = pending.map((p) => p.id);

  return (
    <>
      <KycStorageWarning />
      <KycReviewWorkspace ctx={ctx} pendingIds={pendingIds} />
    </>
  );
}
