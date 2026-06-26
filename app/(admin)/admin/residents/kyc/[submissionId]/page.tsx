import { NotificationActionResolved } from '@/src/components/admin/NotificationActionResolved';
import { KycReviewWorkspace } from '@/src/components/admin/kyc/KycReviewWorkspace';
import { KycStorageWarning } from '@/src/components/admin/KycStorageWarning';
import { evaluateNotificationDeepLink } from '@/src/lib/admin/notificationDeepLinkGuard';
import { getKycReviewContext, listPendingKycSubmissions } from '@/src/services/kyc';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';

export const dynamic = 'force-dynamic';

export default async function ResidentsKycVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ read?: string }>;
}) {
  const { submissionId } = await params;
  const sp = await searchParams;
  const readParam = typeof sp.read === 'string' ? sp.read : undefined;
  await ensureAdminPageNotificationsSeen(
    `/admin/residents/kyc/${submissionId}`,
    `/admin/residents/kyc/${submissionId}`,
    readParam,
  );

  if (readParam) {
    const deepLink = await evaluateNotificationDeepLink(readParam);
    if (deepLink.status === 'resolved') {
      return <NotificationActionResolved message={deepLink.message} />;
    }
  }

  const [ctx, pending] = await Promise.all([
    getKycReviewContext(submissionId),
    listPendingKycSubmissions(),
  ]);
  if (!ctx) {
    return <NotificationActionResolved />;
  }

  const pendingIds = pending.map((p) => p.id);

  return (
    <>
      <KycStorageWarning />
      <KycReviewWorkspace ctx={ctx} pendingIds={pendingIds} />
    </>
  );
}
