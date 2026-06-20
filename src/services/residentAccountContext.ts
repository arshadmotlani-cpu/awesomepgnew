import {
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
  customerHasConfirmedBooking,
  type ResidentBookingRow,
} from '@/src/db/queries/customer';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import { deriveResidencyJourney, type ResidencyJourneyState } from '@/src/lib/residents/residencyJourney';
import { formatStayDateTime } from '@/src/lib/residents/stayBillingRules';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { projectInvoice } from '@/src/services/rentInvoices';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { paymentLinkPublicUrl } from '@/src/lib/billing/paymentLinkUrl';
import { getLatestPaymentLinkForResident } from '@/src/services/paymentLinks';
import { diffDays } from '@/src/lib/dates';

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
    ? await getResidentFinancialSummary(customerId)
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
    const [rentRes, elecRes, depositSummary] = await Promise.all([
      listRentInvoicesForBooking(primaryBooking.bookingId),
      listElectricityInvoicesForBooking(primaryBooking.bookingId),
      getDepositSummaryForBooking(primaryBooking.bookingId),
    ]);

    const depositPaidPaise =
      depositSummary?.collectedPaise ??
      Math.max(0, primaryBooking.depositPaise - (primaryBooking.depositDuePaise ?? 0));
    const depositRefundedPaise = depositSummary?.refundedPaise ?? 0;
    ledgerRefundedPaise = depositRefundedPaise;
    const checkInLabel = formatStayDateTime(primaryBooking.checkInDate, 'check-in');
    const checkOutLabel = primaryBooking.expectedCheckoutDate
      ? formatStayDateTime(primaryBooking.expectedCheckoutDate, 'check-out')
      : null;

    let stayDurationLabel: string | null = null;
    if (primaryBooking.expectedCheckoutDate) {
      const nights = diffDays(primaryBooking.checkInDate, primaryBooking.expectedCheckoutDate);
      stayDurationLabel = `${nights} night${nights === 1 ? '' : 's'}`;
    }

    if (rentRes.ok) {
      for (const inv of rentRes.data) {
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
          label: `Rent · ${inv.billingMonth.slice(0, 7)}`,
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
          paymentLinkUrl: null,
        });
        if (inv.status === 'paid') {
          rentPaymentHistory.push({
            id: inv.id,
            label: `Rent · ${inv.billingMonth.slice(0, 7)}`,
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
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
        });
        const totalAmount = inv.amountPaise + projected.accruedLateFeePaise;
        invoices.push({
          id: inv.id,
          kind: 'electricity',
          invoiceNumber: inv.invoiceNumber,
          label: `Electricity · ${inv.billingMonth.slice(0, 7)}`,
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
          paymentLinkUrl: null,
        });
      }
    }

    if (depositPaidPaise > 0 || primaryBooking.depositPaise > 0) {
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
        paymentLinkUrl: null,
      });
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
    depositPaidPaise: financialSummary?.deposit.paidPaise ?? 0,
    depositHeldPaise: financialSummary?.deposit.paidPaise ?? 0,
    depositRefundablePaise: financialSummary?.deposit.refundablePaise ?? 0,
    depositOutstandingPaise: financialSummary?.deposit.outstandingPaise ?? 0,
  };
}
