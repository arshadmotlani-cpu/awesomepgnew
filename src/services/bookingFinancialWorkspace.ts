/**
 * Data loader for the booking-scoped Checkout & Financial Workspace.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { getAdminBookingDetail } from '@/src/db/queries/admin';
import {
  getVacatingForBooking,
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
} from '@/src/db/queries/customer';
import type { AdminSession } from '@/src/lib/auth/session';
import { buildVacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { buildAdminInvoiceHrefMap } from '@/src/lib/billing/invoiceHrefMap';
import { loadDepositPageData } from '@/src/lib/deposits/loadDepositPageData';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import {
  getCheckoutSettlementDetail,
  getCheckoutSettlementDetailForBooking,
} from '@/src/services/checkoutSettlement';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';

export type BookingFinancialWorkspaceData = {
  bookingId: string;
  bookingCode: string;
  bookingStatus: string;
  durationMode: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositCollectionStatus: string | null;
  moneyBalances: BookingMoneyBalances;
  depositPage: Awaited<ReturnType<typeof loadDepositPageData>>;
  vacating: {
    id: string;
    status: string;
    vacatingDate: string;
    noticeGivenDate: string;
    noticeCompliant: boolean;
    deductionPaise: number;
    approvalPreview: ReturnType<typeof buildVacatingApprovalPreview> | null;
  } | null;
  checkoutDetail: CheckoutSettlementDetail | null;
  checkoutSettlementId: string | null;
  settlementHref: string | null;
  rentInvoices: Awaited<ReturnType<typeof listRentInvoicesForBooking>>;
  electricityInvoices: Awaited<ReturnType<typeof listElectricityInvoicesForBooking>>;
  rentInvoiceHrefMap: Record<string, string>;
};

export async function loadBookingFinancialWorkspace(
  session: AdminSession,
  bookingId: string,
): Promise<{ ok: true; data: BookingFinancialWorkspaceData } | { ok: false; error: string }> {
  const res = await getAdminBookingDetail(bookingId);
  if (!res.ok) {
    return { ok: false, error: res.error ?? 'Could not load booking.' };
  }
  if (!res.data) {
    return { ok: false, error: 'Booking not found.' };
  }

  const b = res.data;
  const primaryRes = b.reservations.find((r) => r.kind === 'primary') ?? b.reservations[0];
  if (!primaryRes) {
    return { ok: false, error: 'Booking has no bed assignment.' };
  }

  const [
    moneyBalances,
    depositPage,
    vacatingRes,
    rentInvoices,
    electricityInvoices,
    checkoutSummary,
    depositStatusRow,
  ] = await Promise.all([
    getBookingMoneyBalances(bookingId),
    loadDepositPageData(bookingId),
    getVacatingForBooking(bookingId),
    listRentInvoicesForBooking(bookingId),
    listElectricityInvoicesForBooking(bookingId),
    getCheckoutSettlementDetailForBooking(bookingId),
    db
      .select({ depositCollectionStatus: bookings.depositCollectionStatus })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1),
  ]);

  if (!moneyBalances) {
    return { ok: false, error: 'Could not load money balances.' };
  }

  let checkoutDetail: CheckoutSettlementDetail | null = checkoutSummary;
  if (checkoutSummary?.id) {
    const withSession = await getCheckoutSettlementDetail(session, checkoutSummary.id);
    checkoutDetail = withSession ?? checkoutSummary;
  }

  const vacatingRow = vacatingRes.ok ? vacatingRes.data : null;
  const depositHeld = guardDepositPaise(moneyBalances.deposit.refundablePaise ?? moneyBalances.deposit.receivedPaise);

  const vacating = vacatingRow
    ? {
        id: vacatingRow.id,
        status: vacatingRow.status,
        vacatingDate: vacatingRow.vacatingDate,
        noticeGivenDate: vacatingRow.noticeGivenDate,
        noticeCompliant: vacatingRow.noticeCompliant,
        deductionPaise: vacatingRow.deductionPaise,
        approvalPreview:
          vacatingRow.status === 'pending'
            ? buildVacatingApprovalPreview(
                {
                  id: vacatingRow.id,
                  bookingId,
                  bookingCode: b.bookingCode,
                  customerId: b.customer.id,
                  customerFullName: b.customer.fullName,
                  customerPhone: b.customer.phone,
                  pgName: primaryRes.pgName,
                  roomNumber: primaryRes.roomNumber,
                  bedCode: primaryRes.bedCode,
                  noticeGivenDate: vacatingRow.noticeGivenDate,
                  vacatingDate: vacatingRow.vacatingDate,
                  noticeCompliant: vacatingRow.noticeCompliant,
                  status: vacatingRow.status,
                  deductionPaise: vacatingRow.deductionPaise,
                  depositRefundPaise: vacatingRow.depositRefundPaise,
                  monthlyRentPaiseSnapshot: vacatingRow.monthlyRentPaiseSnapshot,
                  resolvedAt: vacatingRow.resolvedAt,
                  createdAt: vacatingRow.createdAt,
                  updatedAt: vacatingRow.createdAt,
                },
                depositHeld,
              )
            : null,
      }
    : null;

  const rentInvoiceHrefMap =
    rentInvoices.ok && rentInvoices.data.length > 0
      ? await buildAdminInvoiceHrefMap(
          rentInvoices.data.map((inv) => ({
            sourceTable: 'rent_invoices' as const,
            sourceId: inv.id,
          })),
        )
      : {};

  const settlementId = checkoutDetail?.id ?? null;
  const settlementHref = settlementId ? `#checkout` : null;

  return {
    ok: true,
    data: {
      bookingId,
      bookingCode: b.bookingCode,
      bookingStatus: b.status,
      durationMode: b.durationMode,
      customerId: b.customer.id,
      customerName: b.customer.fullName,
      customerPhone: b.customer.phone,
      pgName: primaryRes.pgName,
      roomNumber: primaryRes.roomNumber,
      bedCode: primaryRes.bedCode,
      depositCollectionStatus: depositStatusRow[0]?.depositCollectionStatus ?? null,
      moneyBalances,
      depositPage,
      vacating,
      checkoutDetail,
      checkoutSettlementId: settlementId,
      settlementHref,
      rentInvoices,
      electricityInvoices,
      rentInvoiceHrefMap,
    },
  };
}
