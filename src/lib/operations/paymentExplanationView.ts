import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import type { getQrBookingPaymentReview } from '@/src/services/qrPayments';
import type { PriorBookingDepositInfo } from '@/src/services/depositCredit';

export type PaymentExplanationLine = {
  key: string;
  label: string;
  amountPaise: number;
  bookingCode?: string | null;
  statusLabel?: string;
  /** Prefix for calculation rows, e.g. "+" */
  amountPrefix?: string;
};

export type PaymentFinancialTraceEntry = {
  bookingId: string;
  bookingCode: string;
  kind: 'refundable' | 'outstanding';
  amountPaise: number;
  status: string;
  transferStatus: string;
  impactOnThisBooking: string;
  addedToCheckout?: boolean;
  reason?: string;
};

export type PaymentAfterApprovalPreview = {
  rentCollectedPaise: number;
  depositCollectedPaise: number;
  previousBalanceCollectedPaise: number;
  remainingDepositLiabilityPaise: number;
  remainingDepositLiabilitySource?: string;
  residentBalanceDuePaise: number;
};

export type PaymentExplanationView = {
  newBookingLines: PaymentExplanationLine[];
  previousBookingLines: PaymentExplanationLine[];
  calculationLines: PaymentExplanationLine[];
  totalExpectedPaise: number;
  customerPaidPaise: number | null;
  resultLabel: string;
  resultTone: 'success' | 'warning' | 'info' | 'danger';
  afterApproval: PaymentAfterApprovalPreview | null;
  financialTrace: PaymentFinancialTraceEntry[];
};

type BookingReview = NonNullable<Awaited<ReturnType<typeof getQrBookingPaymentReview>>>;

function depositPercentLabel(depositRequiredPaise: number, rentDuePaise: number): string {
  if (rentDuePaise <= 0) return 'Required deposit';
  const pct = Math.round((depositRequiredPaise / rentDuePaise) * 100);
  return pct > 0 ? `Required deposit (${pct}%)` : 'Required deposit';
}

function priorOutstandingReason(item: PriorOutstandingItem): string {
  if (item.kind === 'deposit') {
    return 'Previous stay closed with unpaid deposit';
  }
  if (item.kind === 'rent') {
    return 'Outstanding rent from prior stay';
  }
  if (item.kind === 'electricity') {
    return 'Outstanding electricity from prior stay';
  }
  return item.label || 'Prior stay balance';
}

function transferStatusForPriorDeposit(
  deposit: PriorBookingDepositInfo,
  depositCreditSourceBookingId?: string | null,
): string {
  if (depositCreditSourceBookingId && depositCreditSourceBookingId === deposit.bookingId) {
    return 'Transferred to this booking';
  }
  if (deposit.status === 'transferred') return 'Transferred';
  return 'Not transferred';
}

function impactOnThisBookingForPriorDeposit(
  deposit: PriorBookingDepositInfo,
  creditAppliedPaise: number,
  depositCreditSourceBookingId?: string | null,
): string {
  if (depositCreditSourceBookingId && depositCreditSourceBookingId === deposit.bookingId) {
    return `−${formatInrPlain(creditAppliedPaise)} deposit due on this booking`;
  }
  return 'None';
}

function formatInrPlain(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

/** Presentation-only view model for admin booking checkout payment review. */
export function buildBookingPaymentExplanation(input: {
  review: BookingReview;
  depositRequiredPaise: number | null;
  depositCreditAppliedPaise: number;
  depositCreditSourceBookingId?: string | null;
  depositCreditSourceBookingCode?: string | null;
  priorOutstandingItems: PriorOutstandingItem[];
  priorBookingDeposits: PriorBookingDepositInfo[];
}): PaymentExplanationView {
  const {
    review,
    depositRequiredPaise,
    depositCreditAppliedPaise,
    depositCreditSourceBookingId,
    depositCreditSourceBookingCode,
    priorOutstandingItems,
    priorBookingDeposits,
  } = input;

  const rentDuePaise = review.rentDuePaise;
  const depositCashDuePaise = review.depositCashDuePaise;
  const requiredDepositPaise = depositRequiredPaise ?? depositCashDuePaise + depositCreditAppliedPaise;
  const priorOutstandingPaise = priorOutstandingItems.reduce((s, i) => s + i.amountPaise, 0);
  const newBookingChargesPaise = rentDuePaise + depositCashDuePaise;
  const received = review.amountSubmittedPaise;
  const overpaidPaise = Math.max(0, received - review.bookingTotalDuePaise);

  const newBookingLines: PaymentExplanationLine[] = [
    {
      key: 'rent',
      label: 'Rent for stay',
      amountPaise: rentDuePaise,
    },
    {
      key: 'deposit-required',
      label: depositPercentLabel(requiredDepositPaise, rentDuePaise),
      amountPaise: requiredDepositPaise,
    },
  ];

  if (depositCreditAppliedPaise > 0) {
    newBookingLines.push({
      key: 'deposit-credit',
      label: 'Deposit credit applied',
      amountPaise: depositCreditAppliedPaise,
      bookingCode: depositCreditSourceBookingCode,
      amountPrefix: '−',
    });
  }

  if (depositCashDuePaise !== requiredDepositPaise) {
    newBookingLines.push({
      key: 'deposit-due-now',
      label: 'Deposit due at checkout',
      amountPaise: depositCashDuePaise,
    });
  }

  const previousBookingLines: PaymentExplanationLine[] = [];

  for (const d of priorBookingDeposits) {
    if (d.refundablePaise <= 0) continue;
    previousBookingLines.push({
      key: `refundable-${d.bookingId}`,
      label: 'Refundable deposit available',
      amountPaise: d.refundablePaise,
      bookingCode: d.bookingCode,
      statusLabel: d.statusLabel,
    });
  }

  for (const item of priorOutstandingItems) {
    previousBookingLines.push({
      key: `outstanding-${item.bookingId ?? item.label}`,
      label:
        item.kind === 'deposit'
          ? 'Outstanding deposit due'
          : item.kind === 'rent'
            ? 'Outstanding rent due'
            : item.kind === 'electricity'
              ? 'Outstanding electricity due'
              : 'Outstanding balance due',
      amountPaise: item.amountPaise,
      bookingCode: item.bookingCode,
    });
  }

  const calculationLines: PaymentExplanationLine[] = [
    {
      key: 'new-booking',
      label: 'New booking charges',
      amountPaise: newBookingChargesPaise,
    },
  ];

  if (priorOutstandingPaise > 0) {
    calculationLines.push({
      key: 'prior-balance',
      label: 'Previous booking balance',
      amountPaise: priorOutstandingPaise,
      amountPrefix: '+',
    });
  }

  const priorBalanceCollectedPaise = Math.min(
    priorOutstandingPaise,
    Math.max(0, received - review.rentPaisePaid - review.depositPaisePaid),
  );

  const refundableStillHeld = priorBookingDeposits.filter(
    (d) => d.refundablePaise > 0 && d.status === 'pending_refund',
  );
  const primaryRefundable = refundableStillHeld.sort((a, b) => b.refundablePaise - a.refundablePaise)[0];

  const remainingDepositLiabilityPaise =
    review.depositDuePaise > 0
      ? review.depositDuePaise
      : primaryRefundable?.refundablePaise ?? 0;

  const residentBalanceDuePaise =
    review.depositDuePaise +
    Math.max(0, review.bookingTotalDuePaise - received);

  let resultLabel: string;
  let resultTone: PaymentExplanationView['resultTone'];
  if (overpaidPaise > 0) {
    resultLabel = `Overpaid by ${formatInrPlain(overpaidPaise)}`;
    resultTone = 'info';
  } else if (received < review.bookingTotalDuePaise) {
    resultLabel = `Short by ${formatInrPlain(review.bookingTotalDuePaise - received)}`;
    resultTone = 'danger';
  } else if (review.depositDuePaise > 0) {
    resultLabel = 'Approved with deposit balance still due';
    resultTone = 'warning';
  } else if (residentBalanceDuePaise <= 0) {
    resultLabel = '✓ Fully settled';
    resultTone = 'success';
  } else {
    resultLabel = `₹${(residentBalanceDuePaise / 100).toLocaleString('en-IN')} still due after approval`;
    resultTone = 'warning';
  }

  const financialTrace: PaymentFinancialTraceEntry[] = [];

  for (const d of priorBookingDeposits) {
    financialTrace.push({
      bookingId: d.bookingId,
      bookingCode: d.bookingCode ?? 'Prior stay',
      kind: 'refundable',
      amountPaise: d.refundablePaise,
      status: d.statusLabel,
      transferStatus: transferStatusForPriorDeposit(d, depositCreditSourceBookingId),
      impactOnThisBooking: impactOnThisBookingForPriorDeposit(
        d,
        depositCreditAppliedPaise,
        depositCreditSourceBookingId,
      ),
    });
  }

  for (const item of priorOutstandingItems) {
    financialTrace.push({
      bookingId: item.bookingId ?? item.bookingCode ?? item.label,
      bookingCode: item.bookingCode ?? item.label,
      kind: 'outstanding',
      amountPaise: item.amountPaise,
      status: 'Outstanding',
      transferStatus: 'Added to checkout total',
      impactOnThisBooking: `+${formatInrPlain(item.amountPaise)} on this checkout`,
      addedToCheckout: true,
      reason: priorOutstandingReason(item),
    });
  }

  return {
    newBookingLines,
    previousBookingLines,
    calculationLines,
    totalExpectedPaise: review.bookingTotalDuePaise,
    customerPaidPaise: received,
    resultLabel,
    resultTone,
    afterApproval: {
      rentCollectedPaise: review.rentPaisePaid,
      depositCollectedPaise: review.depositPaisePaid,
      previousBalanceCollectedPaise: priorBalanceCollectedPaise,
      remainingDepositLiabilityPaise,
      remainingDepositLiabilitySource:
        review.depositDuePaise > 0
          ? 'This booking'
          : primaryRefundable?.bookingCode
            ? `refundable from ${primaryRefundable.bookingCode}`
            : undefined,
      residentBalanceDuePaise,
    },
    financialTrace,
  };
}

/** Simple explanation for non-booking-checkout payment proofs (rent, electricity, etc.). */
export function buildSimplePaymentExplanation(input: {
  lines: Array<{ label: string; amountPaise: number }>;
  totalExpectedPaise: number;
  receivedPaise: number | null;
  resultLabel: string | null;
}): Pick<
  PaymentExplanationView,
  'calculationLines' | 'totalExpectedPaise' | 'customerPaidPaise' | 'resultLabel' | 'resultTone'
> & {
  newBookingLines: [];
  previousBookingLines: [];
  afterApproval: null;
  financialTrace: [];
} {
  const received = input.receivedPaise;
  const overpaid =
    received != null ? Math.max(0, received - input.totalExpectedPaise) : 0;
  const shortfall =
    received != null ? Math.max(0, input.totalExpectedPaise - received) : 0;

  let resultLabel = input.resultLabel ?? 'Verify screenshot before approving';
  let resultTone: PaymentExplanationView['resultTone'] = 'info';
  if (overpaid > 0) {
    resultLabel = `Overpaid by ${formatInrPlain(overpaid)}`;
  } else if (shortfall > 0) {
    resultLabel = `Short by ${formatInrPlain(shortfall)}`;
    resultTone = 'danger';
  } else if (received != null && shortfall === 0 && overpaid === 0) {
    resultLabel = '✓ Matches expected amount';
    resultTone = 'success';
  }

  return {
    newBookingLines: [],
    previousBookingLines: [],
    calculationLines: input.lines.map((line, i) => ({
      key: `line-${i}`,
      label: line.label,
      amountPaise: line.amountPaise,
    })),
    totalExpectedPaise: input.totalExpectedPaise,
    customerPaidPaise: received,
    resultLabel,
    resultTone,
    afterApproval: null,
    financialTrace: [],
  };
}
