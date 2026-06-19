import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, customers } from '@/src/db/schema';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { Badge } from '@/src/components/admin/Badge';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getDepositInvoiceForBooking } from '@/src/services/depositInvoices';
import { DepositAdjustForms } from '@/src/components/admin/DepositAdjustForms';
import { DepositSettlementPanel } from '@/src/components/admin/DepositSettlementPanel';
import { DepositWalletAdminPanel } from '@/src/components/admin/deposits/DepositWalletAdminPanel';
import { DepositRefundNotice } from '@/src/components/customer/DepositRefundNotice';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { paiseToInr, asPlainNumber } from '@/src/lib/format';
import { loadBedPrice, securityDepositForMode } from '@/src/services/pricing';
import { getUnifiedDepositView } from '@/src/services/depositOperations';
import { logger } from '@/src/lib/logger';

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

async function loadDepositDetailData(bookingId: string) {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      durationMode: bookings.durationMode,
      status: bookings.status,
      depositPaise: bookings.depositPaise,
      customerId: bookings.customerId,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;

  let invoice = null;
  let summary = null;
  let unifiedView = null;
  let loadError: string | null = null;

  try {
    invoice = await getDepositInvoiceForBooking(bookingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[deposit-detail] getDepositInvoiceForBooking failed', { bookingId, message, err });
    logger.error('deposit_detail_invoice_load_failed', { bookingId, message });
    loadError = loadError ?? `Deposit invoice could not be loaded: ${message}`;
  }

  try {
    summary = await getDepositSummaryForBooking(bookingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[deposit-detail] getDepositSummaryForBooking failed', { bookingId, message, err });
    logger.error('deposit_detail_summary_load_failed', { bookingId, message });
    loadError = loadError ?? `Deposit wallet summary could not be loaded: ${message}`;
  }

  try {
    unifiedView = await getUnifiedDepositView(bookingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[deposit-detail] getUnifiedDepositView failed', { bookingId, message, err });
    logger.error('deposit_detail_unified_view_failed', { bookingId, message });
    loadError = loadError ?? `Deposit wallet view could not be loaded: ${message}`;
  }

  const requiredPaise = asPlainNumber(invoice?.requiredPaise ?? booking.depositPaise);
  const collectedPaise = asPlainNumber(
    invoice?.collectedPaise ?? summary?.collectedPaise ?? 0,
  );
  const deductionsPaise = asPlainNumber(
    invoice?.deductionsPaise ?? (summary?.deductedPaise ?? 0) + (summary?.refundedPaise ?? 0),
  );
  const refundablePaise = asPlainNumber(
    invoice?.refundablePaise ?? summary?.refundableBalancePaise ?? 0,
  );
  const isFrozen = invoice?.isFrozen ?? false;

  const [primaryBed] = await db
    .select({
      bedId: bedReservations.bedId,
      moveInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);

  let websiteDepositPaise = 0;
  if (primaryBed?.bedId && primaryBed.moveInDate) {
    try {
      const bedRate = await loadBedPrice(primaryBed.bedId, primaryBed.moveInDate);
      if (bedRate) {
        websiteDepositPaise = securityDepositForMode(
          bedRate,
          booking.durationMode === 'open_ended' ? 'open_ended' : 'monthly',
        );
      }
    } catch (err) {
      console.error('[deposit-detail] loadBedPrice failed', { bookingId, err });
    }
  }

  return {
    booking,
    invoice,
    unifiedView,
    requiredPaise,
    collectedPaise,
    deductionsPaise,
    refundablePaise,
    isFrozen,
    websiteDepositPaise,
    loadError,
  };
}

export default async function AdminDepositDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bookingId } = await params;

  try {
    await ensureAdminPageNotificationsSeen(
      `/admin/deposits/${bookingId}`,
      `/admin/deposits/${bookingId}`,
    );
  } catch (err) {
    console.error('[deposit-detail] ensureAdminPageNotificationsSeen failed', { bookingId, err });
  }

  let data;
  try {
    data = await loadDepositDetailData(bookingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[deposit-detail] page load failed', { bookingId, message, stack });
    logger.error('deposit_detail_page_load_failed', { bookingId, message, stack });
    throw err;
  }

  if (!data) notFound();

  const {
    booking,
    invoice,
    unifiedView,
    requiredPaise,
    collectedPaise,
    deductionsPaise,
    refundablePaise,
    isFrozen,
    websiteDepositPaise,
    loadError,
  } = data;

  return (
    <>
      <PageHeader
        title={`Deposit invoice — ${booking.customerFullName}`}
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

      <DepositRefundNotice />

      {invoice ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(invoice.invoiceStatus)}>{invoice.displayStatus}</Badge>
          {isFrozen ? <Badge tone="zinc">Frozen · settled</Badge> : null}
        </div>
      ) : null}

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Required" value={paiseToInr(requiredPaise)} />
        <Stat label="Collected" value={paiseToInr(collectedPaise)} tone="emerald" />
        <Stat
          label="Deductions"
          value={deductionsPaise > 0 ? paiseToInr(deductionsPaise) : '—'}
          tone="warn"
        />
        <Stat label="Refundable" value={paiseToInr(refundablePaise)} tone="strong" />
      </section>

      {isFrozen ? (
        <p className="mb-6 rounded-lg border border-white/10 bg-[#1A1F27] px-4 py-3 text-sm text-apg-silver">
          This deposit invoice is settled and frozen. The amounts above are the final computed
          settlement.
        </p>
      ) : (
        <>
          {unifiedView ? (
            <DepositWalletAdminPanel view={unifiedView} isFrozen={isFrozen} />
          ) : null}

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-white">Adjust deposit</h2>
            <DepositAdjustForms
              bookingId={bookingId}
              bookingDepositPaise={asPlainNumber(booking.depositPaise)}
              ledgerCollectedPaise={collectedPaise}
              websiteDepositPaise={websiteDepositPaise}
            />
          </section>

          {refundablePaise > 0 || booking.status === 'completed' ? (
            <div className="mb-6">
              <DepositSettlementPanel
                bookingId={bookingId}
                customerId={booking.customerId}
                customerName={booking.customerFullName}
                customerPhone={booking.customerPhone}
                depositHeldPaise={collectedPaise}
                depositPaidPaise={collectedPaise}
                depositRefundablePaise={refundablePaise}
              />
            </div>
          ) : null}
        </>
      )}

      <p className="text-sm text-apg-silver">
        <Link href={`/admin/bookings/${bookingId}`} className="text-[#FF5A1F] hover:underline">
          Booking operations →
        </Link>
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warn' | 'strong' | 'emerald';
}) {
  const bg =
    tone === 'warn'
      ? 'border-rose-400/30 bg-rose-500/10'
      : tone === 'strong'
        ? 'border-emerald-400/30 bg-emerald-500/10'
        : tone === 'emerald'
          ? 'border-emerald-400/20 bg-emerald-500/5'
          : 'border-white/10 bg-[#1A1F27]';
  const text =
    tone === 'warn'
      ? 'text-rose-300'
      : tone === 'strong'
        ? 'text-emerald-300'
        : tone === 'emerald'
          ? 'text-emerald-300'
          : 'text-white';
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${text}`}>{value}</div>
    </div>
  );
}
