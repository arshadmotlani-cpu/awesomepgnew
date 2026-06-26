import Link from 'next/link';
import { NotificationActionResolved } from '@/src/components/admin/NotificationActionResolved';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { DepositSettlementPanel } from '@/src/components/admin/DepositSettlementPanel';
import { DepositActivitySection } from '@/src/components/admin/deposits/DepositActivitySection';
import { DepositAdvancedTools } from '@/src/components/admin/deposits/DepositAdvancedTools';
import { DepositCorrectForm } from '@/src/components/admin/deposits/DepositCorrectForm';
import { DepositDetailSection } from '@/src/components/admin/deposits/DepositDetailSection';
import { DepositSummaryCard } from '@/src/components/admin/deposits/DepositSummaryCard';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { evaluateNotificationDeepLink } from '@/src/lib/admin/notificationDeepLinkGuard';
import { jsonSafe } from '@/src/lib/depositPageDebug';
import { loadDepositPageData } from '@/src/lib/deposits/loadDepositPageData';
import { DepositWorkflowHeader } from '@/src/components/admin/deposits/DepositWorkflowHeader';
import { TransferOldDepositPanel } from '@/src/components/admin/deposits/TransferOldDepositPanel';
import { buildDepositWorkflowPresentation } from '@/src/lib/deposits/depositWorkflowPresentation';
import { clientSafeDepositView } from '@/src/lib/deposits/unifiedDepositView';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

export default async function AdminDepositDetailPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<{ saved?: string; depositError?: string; read?: string }>;
}) {
  const { bookingId } = await params;
  const query = await searchParams;
  const saved = query.saved === '1';
  const depositError = query.depositError ? decodeURIComponent(query.depositError) : null;
  const readParam = typeof query.read === 'string' ? query.read : undefined;

  try {
    await ensureAdminPageNotificationsSeen(
      `/admin/deposits/${bookingId}`,
      `/admin/deposits/${bookingId}`,
      readParam,
    );
  } catch (err) {
    console.error('[deposit-detail] ensureAdminPageNotificationsSeen failed', { bookingId, err });
  }

  const deepLink = readParam ? await evaluateNotificationDeepLink(readParam) : { status: 'none' as const, message: '' };
  if (deepLink.status === 'resolved') {
    return <NotificationActionResolved message={deepLink.message} />;
  }

  const data = await loadDepositPageData(bookingId);

  if (!data?.booking) {
    if (data?.loadError) {
      return (
        <>
          <PageHeader title="Security deposit" description="Could not load deposit details." />
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <p>{data.loadError}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {data.customerId ? (
                <Link
                  href={`/admin/residents/${data.customerId}`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Open resident profile →
                </Link>
              ) : null}
              <Link
                href={`/admin/bookings/${bookingId}`}
                className="text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Open booking →
              </Link>
              <Link href="/admin/deposits" className="text-sm text-apg-silver hover:text-white">
                ← All deposits
              </Link>
            </div>
          </div>
        </>
      );
    }
    return <NotificationActionResolved />;
  }

  const {
    booking,
    customerId,
    invoice,
    unifiedView,
    isFrozen,
    loadError,
    walletProps,
    adjustProps,
    settlementProps,
  } = data;

  const syncWarning =
    unifiedView && !unifiedView.walletInSync && unifiedView.walletMismatchReason
      ? unifiedView.walletMismatchReason
      : null;

  const workflow = unifiedView
    ? buildDepositWorkflowPresentation({
        view: clientSafeDepositView(unifiedView),
        invoiceStatus: invoice?.displayStatus ?? unifiedView.invoiceStatus,
        isFrozen,
        syncWarning,
      })
    : null;

  return (
    <>
      <PageHeader
        title={`Security deposit — ${booking.customerFullName}`}
        description={`${booking.bookingCode} · ${booking.customerPhone}`}
        actions={
          <Link
            href="/admin/deposits"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-apg-silver hover:text-white"
          >
            ← All deposits
          </Link>
        }
      />

      {workflow ? <DepositWorkflowHeader workflow={workflow} /> : null}

      {loadError ? (
        <div className="mb-6 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {loadError} Showing booking data where available.
        </div>
      ) : null}

      <p className="mb-6 text-sm text-apg-silver">
        <Link href={`/admin/residents/${customerId}`} className="text-[#FF5A1F] hover:underline">
          Resident profile
        </Link>
        {' · '}
        <Link href={`/admin/bookings/${bookingId}`} className="text-[#FF5A1F] hover:underline">
          Booking
        </Link>
      </p>

      {unifiedView ? (
        <DepositDetailSection
          title="Deposit summary"
          description="Current balance for this booking. All amounts below come from your records."
        >
          <DepositSummaryCard
            view={jsonSafe(clientSafeDepositView(unifiedView))}
            invoiceStatus={invoice?.displayStatus ?? unifiedView.invoiceStatus}
            syncWarning={syncWarning}
            isFrozen={isFrozen}
          />
        </DepositDetailSection>
      ) : null}

      {!isFrozen ? (
        <DepositDetailSection
          title="Transfer old deposit"
          description="Admin-only — apply refundable deposit from a prior booking to this one. Never done automatically for customer bookings."
        >
          <TransferOldDepositPanel targetBookingId={bookingId} />
        </DepositDetailSection>
      ) : null}

      {isFrozen ? (
        <p className="mb-8 rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-apg-silver">
          This deposit is settled and closed. No further collections or corrections are allowed.
        </p>
      ) : walletProps ? (
        <>
          <DepositCorrectForm
            view={jsonSafe(clientSafeDepositView(walletProps.view))}
            saved={saved}
            errorMessage={depositError}
          />

          {adjustProps ? <DepositActivitySection bookingId={adjustProps.bookingId} /> : null}

          {settlementProps ? <DepositSettlementPanel {...settlementProps} /> : null}

          {adjustProps ? (
            <DepositAdvancedTools
              view={jsonSafe(clientSafeDepositView(walletProps.view))}
              bookingId={bookingId}
              adjustProps={jsonSafe(adjustProps)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
