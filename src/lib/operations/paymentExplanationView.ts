import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import type { getQrBookingPaymentReview } from '@/src/services/qrPayments';
import type { PriorBookingDepositInfo } from '@/src/services/depositCredit';

export type PaymentExplanationLine = {
  key: string;
  label: string;
  amountPaise: number;
  bookingCode?: string | null;
  statusLabel?: string;
  /** Prefix for calculation rows, e.g. "+" or "−" */
  amountPrefix?: string;
  /** When true, line is subtracted in mental arithmetic (display only). */
  isDeduction?: boolean;
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

export type NetDepositPosition = {
  refundableDepositsPaise: number;
  outstandingDepositsPaise: number;
  netPaise: number;
  netLabel: string;
  netTone: 'positive' | 'negative' | 'neutral';
};

export type PaymentExplanationView = {
  /** Rent for this checkout only. */
  newBookingLines: PaymentExplanationLine[];
  depositCalculationLines: PaymentExplanationLine[];
  netDepositPosition: NetDepositPosition | null;
  /** Line items that sum exactly to totalExpectedPaise. */
  calculationLines: PaymentExplanationLine[];
  totalExpectedPaise: number;
  customerPaidPaise: number | null;
  resultLabel: string;
  resultTone: 'success' | 'warning' | 'info' | 'danger';
  afterApproval: PaymentAfterApprovalPreview | null;
  financialTrace: PaymentFinancialTraceEntry[];
};

type BookingReview = NonNullable<Awaited<ReturnType<typeof getQrBookingPaymentReview>>>;

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

function priorOutstandingCalculationLabel(item: PriorOutstandingItem): string {
  if (item.kind === 'deposit') return 'Previous outstanding';
  if (item.kind === 'rent') return 'Previous outstanding rent';
  if (item.kind === 'electricity') return 'Previous outstanding electricity';
  return 'Previous outstanding balance';
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

function buildNetDepositPosition(input: {
  priorBookingDeposits: PriorBookingDepositInfo[];
  priorOutstandingItems: PriorOutstandingItem[];
}): NetDepositPosition {
  const refundableDepositsPaise = input.priorBookingDeposits.reduce(
    (sum, d) => sum + Math.max(0, d.refundablePaise),
    0,
  );
  const outstandingDepositsPaise = input.priorOutstandingItems
    .filter((item) => item.kind === 'deposit')
    .reduce((sum, item) => sum + item.amountPaise, 0);

  const netPaise = refundableDepositsPaise - outstandingDepositsPaise;

  let netLabel: string;
  let netTone: NetDepositPosition['netTone'];
  if (netPaise > 0) {
    netLabel = `+${formatInrPlain(netPaise)} refundable`;
    netTone = 'positive';
  } else if (netPaise < 0) {
    netLabel = `−${formatInrPlain(Math.abs(netPaise))} due`;
    netTone = 'negative';
  } else {
    netLabel = '₹0 settled';
    netTone = 'neutral';
  }

  return {
    refundableDepositsPaise,
    outstandingDepositsPaise,
    netPaise,
    netLabel,
    netTone,
  };
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
  const received = review.amountSubmittedPaise;
  const overpaidPaise = Math.max(0, received - review.bookingTotalDuePaise);

  const newBookingLines: PaymentExplanationLine[] = [
    {
      key: 'rent',
      label: 'Rent for stay',
      amountPaise: rentDuePaise,
    },
  ];

  const depositCalculationLines: PaymentExplanationLine[] = [
    {
      key: 'deposit-required',
      label: 'Deposit required for booking',
      amountPaise: requiredDepositPaise,
    },
  ];

  if (depositCreditAppliedPaise > 0) {
    depositCalculationLines.push({
      key: 'deposit-credit',
      label: 'Less refundable deposit available',
      amountPaise: depositCreditAppliedPaise,
      bookingCode: depositCreditSourceBookingCode,
      amountPrefix: '−',
      isDeduction: true,
    });
  }

  depositCalculationLines.push({
    key: 'deposit-due-now',
    label: 'Deposit due now',
    amountPaise: depositCashDuePaise,
  });

  for (const item of priorOutstandingItems.filter((row) => row.kind === 'deposit')) {
    depositCalculationLines.push({
      key: `prior-deposit-${item.bookingId ?? item.bookingCode ?? item.label}`,
      label: 'Outstanding balance from previous booking',
      amountPaise: item.amountPaise,
      bookingCode: item.bookingCode,
      amountPrefix: '+',
    });
  }

  const calculationLines: PaymentExplanationLine[] = [
    {
      key: 'rent',
      label: 'Rent',
      amountPaise: rentDuePaise,
    },
    {
      key: 'deposit-due-now',
      label: 'Deposit due now',
      amountPaise: depositCashDuePaise,
    },
  ];

  for (const item of priorOutstandingItems) {
    calculationLines.push({
      key: `calc-prior-${item.bookingId ?? item.bookingCode ?? item.label}`,
      label: priorOutstandingCalculationLabel(item),
      amountPaise: item.amountPaise,
      bookingCode: item.bookingCode,
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

  const netDepositPosition = buildNetDepositPosition({
    priorBookingDeposits,
    priorOutstandingItems,
  });

  return {
    newBookingLines,
    depositCalculationLines,
    netDepositPosition:
      netDepositPosition.refundableDepositsPaise > 0 ||
      netDepositPosition.outstandingDepositsPaise > 0
        ? netDepositPosition
        : null,
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
  | 'calculationLines'
  | 'totalExpectedPaise'
  | 'customerPaidPaise'
  | 'resultLabel'
  | 'resultTone'
> & {
  newBookingLines: [];
  depositCalculationLines: [];
  netDepositPosition: null;
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
    depositCalculationLines: [],
    netDepositPosition: null,
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
