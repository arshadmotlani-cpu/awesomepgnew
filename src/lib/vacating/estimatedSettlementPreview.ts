/**
 * Estimated settlement at move-out approval — V2 rent/notice buckets with pending deductions at zero.
 */
import { diffDays, normalizeIsoDateOnly } from '@/src/lib/dates';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { resolveStayCheckInDate } from '@/src/lib/checkout/checkoutSettlementV2Compute';
import {
  ESTIMATED_REFUND_DISCLAIMER,
  formatDualDaysAndPaise,
  formatRentConsumedHint,
  formatSettlementDate,
  formatSettlementDays,
  formatSettlementPaise,
  PENDING_DAMAGES_LABEL,
  PENDING_ELECTRICITY_LABEL,
  PENDING_OTHER_LABEL,
  resolveDaysPaidDisplay,
  type SettlementDisplaySection,
} from '@/src/lib/checkout/settlementDisplayFormat';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { paiseToInr } from '@/src/lib/format';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import { breakdownFromStoredNoticeSnapshot } from '@/src/lib/vacating/noticeDeductionPresentation';
import { resolveNoticeSettlementDisplayForVacating } from '@/src/services/noticeSettlementDisplay';
import { buildSettlementBillingDatesSectionRows } from '@/src/lib/vacating/settlementBillingRows';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type EstimatedSettlementVacatingInput = {
  bookingId: string;
  noticeGivenDate: string;
  vacatingDate: string;
  monthlyRentPaiseSnapshot: number;
  noticeRentCoveredDays?: number;
  noticeChargeableDays?: number;
  deductionPaise?: number;
  noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
  stayType?: string | null;
  durationMode?: string | null;
};

export type EstimatedSettlementPreview = {
  sections: SettlementDisplaySection[];
  auditTrace: Array<{ id: string; label: string; value: string }>;
  waterfall: CheckoutSettlementWaterfall;
  estimatedRefundPaise: number;
  estimatedUnusedRentCreditPaise: number;
  estimatedRefundableDepositPaise: number;
  depositHeldPaise: number;
  disclaimer: string;
  mode: 'estimate' | 'baseline' | 'final';
};

export async function buildEstimatedSettlementPreview(
  input: EstimatedSettlementVacatingInput,
  opts?: { mode?: EstimatedSettlementPreview['mode']; waterfall?: CheckoutSettlementWaterfall | null },
): Promise<EstimatedSettlementPreview | null> {
  const vacatingDate = normalizeIsoDateOnly(input.vacatingDate);
  const noticeGivenDate = normalizeIsoDateOnly(input.noticeGivenDate);
  const checkIn = await resolveStayCheckInDate(input.bookingId);
  if (!checkIn || !vacatingDate) return null;

  const [money, wallet] = await Promise.all([
    getBookingMoneyBalances(input.bookingId),
    getDepositSummaryForBooking(input.bookingId),
  ]);

  const rentPaidPaise = guardDepositPaise(money?.rent.receivedPaise ?? 0);
  const depositHeldPaise = guardDepositPaise(wallet?.refundableBalancePaise ?? 0);
  const monthlyRentPaise = guardDepositPaise(input.monthlyRentPaiseSnapshot);

  const notice = await resolveNoticeSettlementDisplayForVacating({
    bookingId: input.bookingId,
    noticeGivenDate,
    vacatingDate,
    monthlyRentPaiseSnapshot: monthlyRentPaise,
    noticeRentCoveredDays: input.noticeRentCoveredDays,
    noticeChargeableDays: input.noticeChargeableDays,
    noticeDeductionPaise: input.deductionPaise,
    noticeBreakdownJson: input.noticeBreakdownJson,
    stayType: input.stayType,
    durationMode: input.durationMode,
  });

  const missingNoticeDays = notice?.missingNoticeDays ?? 0;

  const { resolveCheckoutTailRentPaiseForBooking } = await import(
    '@/src/lib/checkout/checkoutSettlementV2Compute'
  );
  const checkoutTailRentPaise = await resolveCheckoutTailRentPaiseForBooking({
    bookingId: input.bookingId,
    vacatingDate,
    monthlyRentPaise,
  });

  const waterfall =
    opts?.waterfall ??
    computeCheckoutSettlementV2({
      stayCheckInDate: checkIn,
      stayCheckoutDate: vacatingDate,
      rentPaidPaise,
      monthlyRentPaise,
      depositCollectedPaise: depositHeldPaise,
      missingNoticeDays,
      electricityPaise: 0,
      electricityDeductFromDeposit: true,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
      noticeApplies: noticeDeductionAppliesToBooking({
        stayType: input.stayType,
        durationMode: input.durationMode,
      }),
      checkoutTailRentPaise,
    });

  const dailyRentPaise = waterfall.rentBucket.dailyRentPaise;
  const daysPaid = resolveDaysPaidDisplay(input.noticeBreakdownJson, rentPaidPaise, dailyRentPaise);
  const noticeGivenDays = notice?.noticeGivenDays ?? Math.max(0, diffDays(noticeGivenDate, vacatingDate));

  const mode = opts?.mode ?? 'estimate';
  const hasPendingElectricity =
    mode === 'estimate' || (mode === 'baseline' && waterfall.depositBucket.electricityPaise === 0);
  const hasPendingDamage =
    mode === 'estimate' || (mode === 'baseline' && waterfall.depositBucket.otherPaise === 0);

  const auditTrace: EstimatedSettlementPreview['auditTrace'] = [];
  if (daysPaid.auditHint) {
    auditTrace.push({ id: 'days_paid_audit', label: 'Days paid (calculation)', value: daysPaid.auditHint });
  }
  auditTrace.push({
    id: 'rent_consumed_audit',
    label: 'Rent consumed (calculation)',
    value: formatRentConsumedHint(waterfall.stay.stayDays, dailyRentPaise),
  });

  const sections: SettlementDisplaySection[] = [
    {
      title: 'Billing & dates',
      rows: buildSettlementBillingDatesSectionRows({
        notice,
        vacatingDate,
        stayDays: waterfall.stay.stayDays,
        checkInDate: waterfall.stay.checkInDate,
        checkoutDate: waterfall.stay.checkoutDate,
        daysPaid,
      }),
    },
    {
      title: 'Rent',
      rows: [
        {
          id: 'rent_paid',
          label: 'Rent paid',
          value: formatSettlementPaise(waterfall.rentBucket.paidPaise),
        },
        {
          id: 'rent_consumed',
          label: 'Rent consumed',
          value: formatSettlementPaise(waterfall.rentBucket.consumedPaise),
        },
        {
          id: 'unused_prepaid_rent',
          label: 'Unused prepaid rent',
          value: formatDualDaysAndPaise(notice?.unusedPrepaidRentDays, waterfall.rentBucket.unusedPaise),
        },
      ],
    },
    {
      title: 'Notice',
      rows: [
        {
          id: 'notice_required',
          label: 'Required notice',
          value: notice ? formatSettlementDays(notice.noticeRequiredDays) : '—',
        },
        {
          id: 'notice_given',
          label: 'Notice given',
          value: formatSettlementDays(noticeGivenDays),
        },
        {
          id: 'notice_covered_by_unused_rent',
          label: 'Notice covered by unused rent',
          value: formatDualDaysAndPaise(
            notice?.noticeCoveredByPrepaidRent,
            waterfall.notice.fromUnusedRentPaise,
          ),
        },
        {
          id: 'notice_from_deposit',
          label: 'Remaining notice deducted from deposit',
          value: formatSettlementPaise(waterfall.notice.fromDepositPaise, true),
          deduct: true,
        },
      ],
    },
    {
      title: 'Deposit',
      rows: [
        {
          id: 'deposit_held',
          label: 'Deposit held',
          value: formatSettlementPaise(depositHeldPaise),
        },
        ...(waterfall.depositBucket.tailRentPaise > 0
          ? [
              {
                id: 'tail_rent_through_vacate',
                label: 'Rent through vacate date',
                value: formatSettlementPaise(waterfall.depositBucket.tailRentPaise, true),
                deduct: true,
              },
            ]
          : []),
        {
          id: 'estimated_refundable_deposit',
          label: 'Estimated refundable deposit',
          value: formatSettlementPaise(waterfall.depositBucket.refundablePaise),
        },
      ],
    },
    {
      title: 'Pending deductions',
      rows: [
        {
          id: 'pending_electricity',
          label: 'Electricity',
          value: hasPendingElectricity
            ? PENDING_ELECTRICITY_LABEL
            : formatSettlementPaise(waterfall.depositBucket.electricityPaise, true),
          deduct: !hasPendingElectricity,
        },
        {
          id: 'pending_damages',
          label: 'Damages',
          value: hasPendingDamage
            ? PENDING_DAMAGES_LABEL
            : formatSettlementPaise(waterfall.depositBucket.otherPaise, true),
          deduct: !hasPendingDamage,
        },
        {
          id: 'pending_other',
          label: 'Other deductions',
          value: hasPendingDamage ? PENDING_OTHER_LABEL : formatSettlementPaise(0),
        },
      ],
    },
  ];

  return {
    sections,
    auditTrace,
    waterfall,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    estimatedUnusedRentCreditPaise: waterfall.refund.unusedRentPortionPaise,
    estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
    depositHeldPaise,
    disclaimer: ESTIMATED_REFUND_DISCLAIMER,
    mode,
  };
}

export async function loadEstimatedSettlementForVacating(
  input: EstimatedSettlementVacatingInput,
): Promise<EstimatedSettlementPreview | null> {
  return buildEstimatedSettlementPreview(input, { mode: 'estimate' });
}

export function estimatedSettlementFromCheckoutWaterfall(args: {
  detail: {
    bookingId: string;
    noticeGivenDate: string;
    vacatingDate: string;
    monthlyRentPaiseSnapshot: number;
    noticeRentCoveredDays?: number;
    noticeChargeableDays?: number;
    noticeDeductionPaise?: number;
    noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
    stayType?: string | null;
    durationMode?: string | null;
    depositRefundablePaise: number;
    preview: {
      damageChargePaise?: number;
      cleaningChargePaise?: number;
      customChargePaise?: number;
      electricityDeductionPaise?: number;
    };
    approvalBaselineLocked?: boolean;
    amountsLocked?: boolean;
  };
  waterfall: CheckoutSettlementWaterfall;
}): EstimatedSettlementPreview {
  const hasPending =
    !args.detail.amountsLocked &&
    args.waterfall.depositBucket.electricityPaise === 0 &&
    args.waterfall.depositBucket.otherPaise === 0;
  const mode: EstimatedSettlementPreview['mode'] = args.detail.amountsLocked
    ? 'final'
    : hasPending && args.detail.approvalBaselineLocked
      ? 'baseline'
      : 'final';

  const notice = breakdownFromStoredNoticeSnapshot({
    noticeGivenDate: args.detail.noticeGivenDate,
    vacatingDate: args.detail.vacatingDate,
    noticeRentCoveredDays: args.detail.noticeRentCoveredDays,
    noticeChargeableDays: args.detail.noticeChargeableDays,
    noticeDeductionPaise: args.detail.noticeDeductionPaise,
    noticeBreakdownJson: args.detail.noticeBreakdownJson,
  });

  const w = args.waterfall;
  const dailyRentPaise = w.rentBucket.dailyRentPaise;
  const daysPaid = resolveDaysPaidDisplay(
    args.detail.noticeBreakdownJson,
    w.rentBucket.paidPaise,
    dailyRentPaise,
  );
  const noticeGivenDays =
    notice?.noticeGivenDays ??
    Math.max(0, diffDays(args.detail.noticeGivenDate, args.detail.vacatingDate));

  const electricityPending = mode !== 'final' && w.depositBucket.electricityPaise === 0;
  const damagePending = mode !== 'final' && w.depositBucket.otherPaise === 0;

  const auditTrace: EstimatedSettlementPreview['auditTrace'] = [];
  if (daysPaid.auditHint) {
    auditTrace.push({ id: 'days_paid_audit', label: 'Days paid (calculation)', value: daysPaid.auditHint });
  }
  auditTrace.push({
    id: 'rent_consumed_audit',
    label: 'Rent consumed (calculation)',
    value: formatRentConsumedHint(w.stay.stayDays, dailyRentPaise),
  });

  return {
    sections: [
      {
        title: 'Billing & dates',
        rows: [
          { id: 'billing_cycle', label: 'Billing cycle', value: notice?.billingCycleLabel ?? '—' },
          {
            id: 'paid_until',
            label: 'Paid until',
            value: notice?.paidUntilDate ? formatSettlementDate(notice.paidUntilDate) : '—',
          },
          { id: 'vacating_date', label: 'Vacating date', value: formatSettlementDate(args.detail.vacatingDate) },
          {
            id: 'days_stayed',
            label: 'Days stayed',
            value: formatSettlementDays(w.stay.stayDays),
            hint: `${w.stay.checkInDate} → ${w.stay.checkoutDate}`,
          },
          { id: 'days_paid', label: 'Days paid', value: daysPaid.value, hint: daysPaid.hint },
        ],
      },
      {
        title: 'Rent',
        rows: [
          { id: 'rent_paid', label: 'Rent paid', value: formatSettlementPaise(w.rentBucket.paidPaise) },
          {
            id: 'rent_consumed',
            label: 'Rent consumed',
            value: formatSettlementPaise(w.rentBucket.consumedPaise),
          },
          {
            id: 'unused_prepaid_rent',
            label: 'Unused prepaid rent',
            value: formatDualDaysAndPaise(notice?.unusedPrepaidRentDays, w.rentBucket.unusedPaise),
          },
        ],
      },
      {
        title: 'Notice',
        rows: [
          {
            id: 'notice_required',
            label: 'Required notice',
            value: notice ? formatSettlementDays(notice.noticeRequiredDays) : '—',
          },
          { id: 'notice_given', label: 'Notice given', value: formatSettlementDays(noticeGivenDays) },
          {
            id: 'notice_covered_by_unused_rent',
            label: 'Notice covered by unused rent',
            value: formatDualDaysAndPaise(notice?.noticeCoveredByPrepaidRent, w.notice.fromUnusedRentPaise),
          },
          {
            id: 'notice_from_deposit',
            label: 'Remaining notice deducted from deposit',
            value: formatSettlementPaise(w.notice.fromDepositPaise, true),
            deduct: true,
          },
        ],
      },
      {
        title: 'Deposit',
        rows: [
          {
            id: 'deposit_held',
            label: 'Deposit held',
            value: formatSettlementPaise(args.detail.depositRefundablePaise),
          },
          {
            id: 'estimated_refundable_deposit',
            label: mode === 'final' ? 'Refundable deposit' : 'Estimated refundable deposit',
            value: formatSettlementPaise(w.depositBucket.refundablePaise),
          },
        ],
      },
      {
        title: mode === 'final' ? 'Deductions' : 'Pending deductions',
        rows: [
          {
            id: 'pending_electricity',
            label: 'Electricity',
            value: electricityPending
              ? PENDING_ELECTRICITY_LABEL
              : formatSettlementPaise(w.depositBucket.electricityPaise, true),
            deduct: !electricityPending,
          },
          {
            id: 'pending_damages',
            label: 'Damages',
            value: damagePending ? PENDING_DAMAGES_LABEL : formatSettlementPaise(w.depositBucket.otherPaise, true),
            deduct: !damagePending,
          },
          {
            id: 'pending_other',
            label: 'Other deductions',
            value: damagePending ? PENDING_OTHER_LABEL : formatSettlementPaise(0),
          },
        ],
      },
    ],
    auditTrace,
    waterfall: w,
    estimatedRefundPaise: w.refund.totalPaise,
    estimatedUnusedRentCreditPaise: w.refund.unusedRentPortionPaise,
    estimatedRefundableDepositPaise: w.depositBucket.refundablePaise,
    depositHeldPaise: args.detail.depositRefundablePaise,
    disclaimer:
      mode === 'final'
        ? `Final refund${w.refund.unusedRentPortionPaise > 0 ? ` — includes ${paiseToInr(w.refund.unusedRentPortionPaise)} unused rent credit` : ''}`
        : ESTIMATED_REFUND_DISCLAIMER,
    mode,
  };
}
