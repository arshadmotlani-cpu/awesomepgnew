import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { vacatingRequests } from '@/src/db/schema';
import {
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  customerHasConfirmedBooking,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
import { firstOfMonth } from '@/src/services/billing';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import { deriveResidencyJourney, type ResidencyJourneyState } from '@/src/lib/residents/residencyJourney';
import { formatStayDateTime } from '@/src/lib/residents/stayBillingRules';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { projectInvoice } from '@/src/services/rentInvoices';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { batchLookupFinancialInvoiceIds } from '@/src/lib/billing/invoiceNumbering.server';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import { isFinancialInvoiceUuid } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { formatDate, tryDiffDays } from '@/src/lib/dates';

export type ResidentInvoiceCard = {
  id: string;
  kind: 'rent' | 'electricity' | 'deposit';
  invoiceNumber: string;
  label: string;
  stayDurationLabel: string | null;
  checkInLabel: string | null;
  checkOutLabel: string | null;
  rentPaise: number;
  electricityPaise: number;
  depositPaidPaise: number;
  finalAmountPaise: number;
  status: string;
  dueDate: string | null;
  payHref: string | null;
  detailHref: string | null;
  paymentLinkUrl: string | null;
};

export type RentPaymentHistoryRow = {
  id: string;
  label: string;
  paidPaise: number;
  paidAt: string | null;
  status: string;
};

export type ResidentAccountContext = {
  customer: NonNullable<Awaited<ReturnType<typeof getCustomerById>>>;
  profileComplete: boolean;
  hasConfirmedBooking: boolean;
  isActiveStay: boolean;
  primaryBooking: ResidentBookingRow | null;
  financialSummary: ResidentFinancialSummary | null;
  journey: ResidencyJourneyState;
  invoices: ResidentInvoiceCard[];
  rentPaymentHistory: RentPaymentHistoryRow[];
  depositStatusLabel: string;
  depositPaidPaise: number;
  depositHeldPaise: number;
  depositRefundablePaise: number;
  depositOutstandingPaise: number;
};

function depositStatusLabel(input: {
  paidPaise: number;
  requiredPaise: number;
  refundablePaise: number;
  outstandingPaise: number;
  refundedPaise?: number;
}): string {
  if (input.outstandingPaise > 0) return 'Partially paid';
  if ((input.refundedPaise ?? 0) > 0 && input.refundablePaise === 0) return 'Refunded';
  if (input.refundablePaise > 0 && input.refundablePaise < input.paidPaise) return 'Adjusted';
  if (input.refundablePaise > 0) return 'Held';
  if (input.paidPaise > 0) return 'Settled';
  return 'Pending';
}

function billingMonthLabel(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (raw.length >= 7) return raw.slice(0, 7);
  return '—';
}

export async function loadResidentAccountContext(
  customerId: string,
): Promise<ResidentAccountContext | null> {
  const customer = await getCustomerById(customerId);
  if (!customer) return null;

  const profileComplete = isProfileComplete(customer);
  const confirmed = await customerHasConfirmedBooking(customerId);
  const hasConfirmedBooking = confirmed.ok && confirmed.data;
  const tenancy = await getActiveTenancyForCustomer(customerId);
  const isActiveStay = customer.residencyStatus === 'active' && tenancy != null;

  const bookings = await listResidentBookingsForCustomer(customerId);
  const uniqueBookings =
    bookings.ok && bookings.data.length > 0
      ? Array.from(new Map(bookings.data.map((b) => [b.bookingId, b])).values())
      : [];
  const primaryBooking = uniqueBookings[0] ?? null;

  const financialSummary = hasConfirmedBooking
    ? await getResidentFinancialAccount(customerId)
    : null;

  const depositPaid =
    financialSummary != null &&
    financialSummary.deposit.requiredPaise > 0 &&
    financialSummary.deposit.outstandingPaise === 0;

  const journey = deriveResidencyJourney({
    profileComplete,
    kycStatus: customer.kycStatus,
    hasConfirmedBooking,
    depositPaid,
    isActiveStay,
    residencyStatus: customer.residencyStatus,
    depositOutstandingPaise: financialSummary?.deposit.outstandingPaise ?? 0,
  });

  const invoices: ResidentInvoiceCard[] = [];
  const rentPaymentHistory: RentPaymentHistoryRow[] = [];
  let ledgerRefundedPaise = 0;
  if (primaryBooking) {
    const [rentRes, elecRes, depositSummary, openVacating] = await Promise.all([
      listRentInvoicesForBooking(primaryBooking.bookingId),
      listElectricityInvoicesForBooking(primaryBooking.bookingId),
      getDepositSummaryForBooking(primaryBooking.bookingId),
      db
        .select({ vacatingDate: vacatingRequests.vacatingDate })
        .from(vacatingRequests)
        .where(
          and(
            eq(vacatingRequests.bookingId, primaryBooking.bookingId),
            inArray(vacatingRequests.status, ['pending', 'approved']),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    const depositNetHeldPaise =
      depositSummary != null && depositSummary.entries.length > 0
        ? Math.max(0, depositSummary.refundableBalancePaise)
        : Math.max(0, primaryBooking.depositPaise - (primaryBooking.depositDuePaise ?? 0));
    const depositPaidPaise = depositNetHeldPaise;
    const depositRefundedPaise = depositSummary?.refundedPaise ?? 0;
    ledgerRefundedPaise = depositRefundedPaise;
    const checkInLabel = primaryBooking.checkInDate
      ? formatStayDateTime(primaryBooking.checkInDate, 'check-in')
      : 'Check-in date pending';
    const checkOutLabel = primaryBooking.expectedCheckoutDate
      ? formatStayDateTime(primaryBooking.expectedCheckoutDate, 'check-out')
      : null;

    let stayDurationLabel: string | null = null;
    if (primaryBooking.expectedCheckoutDate && primaryBooking.checkInDate) {
      const nights = tryDiffDays(primaryBooking.checkInDate, primaryBooking.expectedCheckoutDate);
      if (nights != null) {
        stayDurationLabel = `${nights} night${nights === 1 ? '' : 's'}`;
      }
    }

    if (rentRes.ok) {
      for (const inv of rentRes.data) {
        if (inv.status === 'cancelled') continue;
        const projected = projectInvoice({
          ...inv,
          cancelledAt: null,
          cancellationReason: null,
          customerId: primaryBooking.customerId,
          bedId: '',
          pgId: primaryBooking.pgId,
          paymentId: null,
          paymentProofUrl: null,
          isAdhoc: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const lateFee =
          inv.status === 'paid'
            ? (inv.lateFeeLockedPaise ?? 0)
            : projected.accruedLateFeePaise;
        const finalAmount = inv.rentPaise + lateFee;
        invoices.push({
          id: inv.id,
          kind: 'rent',
          invoiceNumber: inv.invoiceNumber,
          label: `Rent · ${billingMonthLabel(inv.billingMonth)}`,
          stayDurationLabel,
          checkInLabel,
          checkOutLabel,
          rentPaise: finalAmount,
          electricityPaise: 0,
          depositPaidPaise: 0,
          finalAmountPaise: projected.outstandingPaise > 0 ? projected.outstandingPaise : finalAmount,
          status: projected.effectiveStatus,
          dueDate: inv.dueDate,
          payHref:
            projected.outstandingPaise > 0
              ? `/account/resident/pay-rent/${inv.id}`
              : null,
          detailHref: null,
          paymentLinkUrl: null,
        });
        if (inv.status === 'paid') {
          rentPaymentHistory.push({
            id: inv.id,
            label: inv.paidAt
              ? `Rent · paid ${formatDate(inv.paidAt)}`
              : `Rent · ${billingMonthLabel(inv.billingMonth)}`,
            paidPaise: inv.paidPrincipalPaise + inv.paidLateFeePaise,
            paidAt: inv.paidAt?.toISOString() ?? null,
            status: inv.status,
          });
        }
      }
    }

    if (elecRes.ok) {
      for (const inv of elecRes.data) {
        const projected = projectElectricityInvoice({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          electricityBillId: inv.electricityBillId,
          roomId: inv.roomId,
          bookingId: inv.bookingId,
          customerId: primaryBooking.customerId,
          bedId: '',
          billingMonth: inv.billingMonth,
          dueDate: inv.dueDate,
          amountPaise: inv.amountPaise,
          paidPaise: inv.paidPaise,
          lateFeeLockedPaise: inv.lateFeeLockedPaise,
          status: inv.status,
          paymentId: null,
          paidAt: inv.paidAt,
          paymentProofUrl: null,
          unitsShare: null,
          activeDays: null,
          cancelledAt: null,
          supersededByInvoiceId: null,
          duplicateDetectedAt: null,
          isPipelineTest: false,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
        });
        const totalAmount = inv.amountPaise + projected.accruedLateFeePaise;
        invoices.push({
          id: inv.id,
          kind: 'electricity',
          invoiceNumber: inv.invoiceNumber,
          label: `Electricity · ${billingMonthLabel(inv.billingMonth)}`,
          stayDurationLabel,
          checkInLabel,
          checkOutLabel,
          rentPaise: 0,
          electricityPaise: totalAmount,
          depositPaidPaise: 0,
          finalAmountPaise: projected.outstandingPaise > 0 ? projected.outstandingPaise : totalAmount,
          status: projected.effectiveStatus,
          dueDate: inv.dueDate,
          payHref:
            projected.outstandingPaise > 0
              ? `/account/resident/pay-electricity/${inv.id}`
              : null,
          detailHref: null,
          paymentLinkUrl: null,
        });
      }
    }

    if (openVacating && elecRes.ok) {
      const checkoutMonth = firstOfMonth(openVacating.vacatingDate);
      const hasCheckoutMonthInvoice = elecRes.data.some(
        (inv) =>
          inv.status !== 'cancelled' &&
          firstOfMonth(inv.billingMonth) === checkoutMonth,
      );
      if (!hasCheckoutMonthInvoice) {
        const monthLabel = checkoutMonth.slice(0, 7);
        invoices.push({
          id: `elec-checkout-pending-${checkoutMonth}`,
          kind: 'electricity',
          invoiceNumber: 'Pending',
          label: `Electricity · ${monthLabel} (final bill at checkout)`,
          stayDurationLabel,
          checkInLabel,
          checkOutLabel: formatStayDateTime(openVacating.vacatingDate, 'check-out'),
          rentPaise: 0,
          electricityPaise: 0,
          depositPaidPaise: 0,
          finalAmountPaise: 0,
          status: 'due_at_checkout',
          dueDate: openVacating.vacatingDate,
          payHref: null,
          detailHref: null,
          paymentLinkUrl: null,
        });
      }
    }

    if (depositPaidPaise > 0) {
      invoices.push({
        id: `deposit-${primaryBooking.bookingId}`,
        kind: 'deposit',
        invoiceNumber: `DEP-${primaryBooking.bookingCode}`,
        label: 'Security deposit',
        stayDurationLabel,
        checkInLabel,
        checkOutLabel,
        rentPaise: 0,
        electricityPaise: 0,
        depositPaidPaise,
        finalAmountPaise: depositPaidPaise,
        status:
          depositRefundedPaise > 0 && (depositSummary?.refundableBalancePaise ?? 0) === 0
            ? 'refunded'
            : depositPaidPaise >= primaryBooking.depositPaise
              ? 'held'
              : 'partial',
        dueDate: primaryBooking.checkInDate,
        payHref: null,
        detailHref: null,
        paymentLinkUrl: null,
      });
    }

    const fiMap = await batchLookupFinancialInvoiceIds(
      invoices
        .filter(
          (inv) =>
            (inv.kind === 'rent' || inv.kind === 'electricity') &&
            isFinancialInvoiceUuid(inv.id),
        )
        .map((inv) => ({
          sourceTable: inv.kind === 'rent' ? 'rent_invoices' : 'electricity_invoices',
          sourceId: inv.id,
        })),
    );
    for (const inv of invoices) {
      if (inv.kind === 'rent' || inv.kind === 'electricity') {
        const table = inv.kind === 'rent' ? 'rent_invoices' : 'electricity_invoices';
        const fiId = fiMap[`${table}:${inv.id}`];
        inv.detailHref = fiId ? invoiceDetailHref(fiId, 'resident') : null;
      }
    }
  }

  const latestRentLink = hasConfirmedBooking
    ? await getLatestPaymentLinkForResident(customerId, 'rent')
    : null;
  const paymentLinkUrl =
    latestRentLink?.status === 'active' ? paymentLinkPublicUrl(latestRentLink.id) : null;
  if (paymentLinkUrl && invoices.length > 0) {
    for (const inv of invoices) {
      if (inv.payHref) inv.paymentLinkUrl = paymentLinkUrl;
    }
  }

  return {
    customer,
    profileComplete,
    hasConfirmedBooking,
    isActiveStay,
    primaryBooking,
    financialSummary,
    journey,
    invoices: invoices.sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? '')),
    rentPaymentHistory: rentPaymentHistory.sort((a, b) =>
      (b.paidAt ?? '').localeCompare(a.paidAt ?? ''),
    ),
    depositStatusLabel: financialSummary
      ? depositStatusLabel({
          paidPaise: financialSummary.deposit.paidPaise,
          requiredPaise: financialSummary.deposit.requiredPaise,
          refundablePaise: financialSummary.deposit.refundablePaise,
          outstandingPaise: financialSummary.deposit.outstandingPaise,
          refundedPaise: ledgerRefundedPaise,
        })
      : 'Pending',
    depositPaidPaise: financialSummary?.deposit.refundablePaise ?? 0,
    depositHeldPaise: financialSummary?.deposit.refundablePaise ?? 0,
    depositRefundablePaise: financialSummary?.deposit.refundablePaise ?? 0,
    depositOutstandingPaise: financialSummary?.deposit.outstandingPaise ?? 0,
  };
}
