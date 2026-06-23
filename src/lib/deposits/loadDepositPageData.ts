/**
 * Shared deposit page data loader for admin deposit detail.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, bookings, customers } from '@/src/db/schema';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getDepositInvoiceForBooking } from '@/src/services/depositInvoices';
import { getUnifiedDepositView, sanitizeUnifiedDepositView } from '@/src/services/depositOperations';
import { clientSafeDepositView, depositAdminDisplayAmounts } from '@/src/lib/deposits/unifiedDepositView';
import { loadBedPrice, computeMonthlyDepositPaise } from '@/src/services/pricing';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { jsonSafe } from '@/src/lib/depositPageDebug';

export type DepositPageLoadResult = {
  booking: {
    id: string;
    bookingCode: string;
    durationMode: string;
    status: string;
    depositPaise: number;
    customerId: string;
    customerFullName: string | null;
    customerPhone: string | null;
  } | null;
  customerId: string | null;
  invoice: Awaited<ReturnType<typeof getDepositInvoiceForBooking>>;
  summary: Awaited<ReturnType<typeof getDepositSummaryForBooking>>;
  unifiedView: ReturnType<typeof sanitizeUnifiedDepositView> | null;
  requiredPaise: number;
  collectedPaise: number;
  deductionsPaise: number;
  refundablePaise: number;
  isFrozen: boolean;
  websiteDepositPaise: number;
  hasPrimaryBedReservation: boolean;
  loadError: string | null;
  walletProps: { view: ReturnType<typeof clientSafeDepositView>; isFrozen: boolean } | null;
  adjustProps: {
    bookingId: string;
    bookingDepositPaise: number;
    ledgerCollectedPaise: number;
    websiteDepositPaise: number;
  } | null;
  settlementProps: {
    bookingId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    depositHeldPaise: number;
    depositPaidPaise: number;
    depositRefundablePaise: number;
  } | null;
};

export async function loadDepositPageData(bookingId: string): Promise<DepositPageLoadResult> {
  const empty: DepositPageLoadResult = {
    booking: null,
    customerId: null,
    invoice: null,
    summary: null,
    unifiedView: null,
    requiredPaise: 0,
    collectedPaise: 0,
    deductionsPaise: 0,
    refundablePaise: 0,
    isFrozen: false,
    websiteDepositPaise: 0,
    hasPrimaryBedReservation: false,
    loadError: null,
    walletProps: null,
    adjustProps: null,
    settlementProps: null,
  };

  try {
    const [booking] = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        durationMode: bookings.durationMode,
        status: bookings.status,
        depositPaise: bookings.depositPaise,
        depositDuePaise: bookings.depositDuePaise,
        customerId: bookings.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return { ...empty, loadError: 'Booking not found (or customer join failed)' };
    }

    let invoice: DepositPageLoadResult['invoice'] = null;
    let summary: DepositPageLoadResult['summary'] = null;
    let unifiedView: DepositPageLoadResult['unifiedView'] = null;
    let loadError: string | null = null;

    try {
      invoice = await getDepositInvoiceForBooking(bookingId);
    } catch (err) {
      loadError = `invoice: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      summary = await getDepositSummaryForBooking(bookingId);
    } catch (err) {
      loadError = loadError ?? `summary: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      const raw = await getUnifiedDepositView(bookingId);
      unifiedView = raw ? sanitizeUnifiedDepositView(raw) : null;
    } catch (err) {
      loadError = loadError ?? `unifiedView: ${err instanceof Error ? err.message : String(err)}`;
    }

    const requiredPaise = guardDepositPaise(invoice?.requiredPaise ?? booking.depositPaise, 'requiredPaise');
    const grossCollectedPaise = guardDepositPaise(
      invoice?.collectedPaise ?? summary?.collectedPaise ?? 0,
      'grossCollectedPaise',
    );
    const grossDeductedPaise = guardDepositPaise(summary?.deductedPaise ?? 0, 'grossDeductedPaise');
    const grossRefundedPaise = guardDepositPaise(summary?.refundedPaise ?? 0, 'grossRefundedPaise');
    const grossRefundableBalancePaise = guardDepositPaise(
      invoice?.refundablePaise ?? summary?.refundableBalancePaise ?? 0,
      'grossRefundableBalancePaise',
    );
    const depositDuePaise = guardDepositPaise(
      unifiedView?.depositDuePaise ?? booking.depositDuePaise,
      'depositDuePaise',
    );
    const display = depositAdminDisplayAmounts({
      grossCollectedPaise,
      grossDeductedPaise,
      grossRefundedPaise,
      grossRefundableBalancePaise,
      requiredPaise,
      depositDuePaise,
    });
    const collectedPaise = display.collectedPaise;
    const deductionsPaise = display.deductionsPaise;
    const refundablePaise = display.refundablePaise;
    const isFrozen = invoice?.isFrozen ?? false;

    let hasPrimaryBedReservation = false;
    let websiteDepositPaise = 0;
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

    hasPrimaryBedReservation = Boolean(primaryBed);
    if (primaryBed?.bedId && primaryBed.moveInDate) {
      try {
        const bedRate = await loadBedPrice(primaryBed.bedId, primaryBed.moveInDate);
        if (bedRate) {
          websiteDepositPaise = guardDepositPaise(
            computeMonthlyDepositPaise(bedRate),
            'websiteDepositPaise',
          );
        }
      } catch (err) {
        loadError = loadError ?? `pricing: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const walletProps = unifiedView
      ? jsonSafe({
          view: clientSafeDepositView(unifiedView),
          isFrozen,
        })
      : null;

    const adjustProps = jsonSafe({
      bookingId,
      bookingDepositPaise: guardDepositPaise(booking.depositPaise, 'booking.depositPaise'),
      ledgerCollectedPaise: collectedPaise,
      websiteDepositPaise: guardDepositPaise(websiteDepositPaise, 'websiteDepositPaise'),
    });

    const settlementProps =
      refundablePaise > 0 || booking.status === 'completed'
        ? jsonSafe({
            bookingId,
            customerId: booking.customerId,
            customerName: booking.customerFullName ?? '',
            customerPhone: booking.customerPhone ?? '',
            depositHeldPaise: refundablePaise,
            depositPaidPaise: collectedPaise,
            depositRefundablePaise: refundablePaise,
          })
        : null;

    return {
      booking: {
        ...booking,
        depositPaise: guardDepositPaise(booking.depositPaise, 'booking.depositPaise'),
      },
      customerId: booking.customerId,
      invoice,
      summary,
      unifiedView,
      requiredPaise,
      collectedPaise,
      deductionsPaise,
      refundablePaise,
      isFrozen,
      websiteDepositPaise,
      hasPrimaryBedReservation,
      loadError,
      walletProps,
      adjustProps,
      settlementProps,
    };
  } catch (err) {
    console.error('[loadDepositPageData] failed', { bookingId, err });
    return {
      ...empty,
      loadError: err instanceof Error ? err.message : String(err),
    };
  }
}
