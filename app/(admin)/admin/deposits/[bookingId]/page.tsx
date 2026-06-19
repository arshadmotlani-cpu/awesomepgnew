import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { Badge } from '@/src/components/admin/Badge';
import { DepositAdjustForms } from '@/src/components/admin/DepositAdjustForms';
import { DepositSettlementPanel } from '@/src/components/admin/DepositSettlementPanel';
import { DepositAdvancedTools } from '@/src/components/admin/deposits/DepositAdvancedTools';
import { DepositCorrectForm } from '@/src/components/admin/deposits/DepositCorrectForm';
import { DepositSummaryCard } from '@/src/components/admin/deposits/DepositSummaryCard';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { jsonSafe } from '@/src/lib/depositPageDebug';
import { loadDepositPageData } from '@/src/lib/deposits/loadDepositPageData';
import { clientSafeDepositView } from '@/src/lib/deposits/unifiedDepositView';

export const dynamic = 'force-dynamic';

type RouteParams = { bookingId: string };

function statusTone(status: string) {
  switch (status) {
    case 'collecting':
      return 'amber' as const;
    case 'held':
      return 'emerald' as const;
    case 'refund_pending':
      return 'sky' as const;
    case 'settled':
      return 'zinc' as const;
    default:
      return 'zinc' as const;
  }
}

export default async function AdminDepositDetailPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<{ saved?: string; depositError?: string }>;
}) {
  const { bookingId } = await params;
  const query = await searchParams;
  const saved = query.saved === '1';
  const depositError = query.depositError ? decodeURIComponent(query.depositError) : null;

  try {
    await ensureAdminPageNotificationsSeen(
      `/admin/deposits/${bookingId}`,
      `/admin/deposits/${bookingId}`,
    );
  } catch (err) {
    console.error('[deposit-detail] ensureAdminPageNotificationsSeen failed', { bookingId, err });
  }

  const data = await loadDepositPageData(bookingId);

  if (!data?.booking) {
    if (data?.loadError) {
      return (
        <>
          <PageHeader title="Deposit invoice" description="Could not load deposit details." />
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
                Booking operations →
              </Link>
              <Link href="/admin/deposits" className="text-sm text-apg-silver hover:text-white">
                ← All deposits
              </Link>
            </div>
          </div>
        </>
      );
    }
    notFound();
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

  return (
    <>
      <PageHeader
        title={`Deposit — ${booking.customerFullName}`}
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
      {loadError ? (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {loadError} Showing booking data where available.
        </div>
      ) : null}
      <p className="mb-4 text-sm text-apg-silver">
        <Link href={`/admin/residents/${customerId}`} className="text-[#FF5A1F] hover:underline">
          Resident profile →
        </Link>
        {' · '}
        <Link href={`/admin/bookings/${bookingId}`} className="text-[#FF5A1F] hover:underline">
          Booking operations →
        </Link>
      </p>

      <DepositRefundNotice />

      {invoice ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(invoice.invoiceStatus)}>{invoice.displayStatus}</Badge>
          {isFrozen ? <Badge tone="zinc">Frozen · settled</Badge> : null}
        </div>
      ) : null}

      {unifiedView ? (
        <DepositSummaryCard
          view={jsonSafe(clientSafeDepositView(unifiedView))}
          invoiceStatus={invoice?.displayStatus ?? unifiedView.invoiceStatus}
          syncWarning={syncWarning}
        />
      ) : null}

      {isFrozen ? (
        <p className="mb-6 rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-apg-silver">
          This deposit invoice is settled and frozen.
        </p>
      ) : walletProps ? (
        <>
          <DepositCorrectForm
            view={jsonSafe(clientSafeDepositView(walletProps.view))}
            saved={saved}
            errorMessage={depositError}
          />
          {!isFrozen && adjustProps ? (
            <DepositAdjustForms bookingId={adjustProps.bookingId} />
          ) : null}
          {settlementProps ? (
            <div className="mb-6">
              <DepositSettlementPanel {...settlementProps} />
            </div>
          ) : null}
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
