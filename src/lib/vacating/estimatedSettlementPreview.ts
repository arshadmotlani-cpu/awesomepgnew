/**
 * Estimated settlement at move-out approval — V2 rent/notice buckets with pending deductions at zero.
 */
import { diffDays } from '@/src/lib/dates';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  ESTIMATED_REFUND_DISCLAIMER,
  formatDualDaysAndPaise,
  formatRentConsumedHint,
  formatSettlementDays,
  formatSettlementPaise,
  PENDING_DAMAGES_LABEL,
  PENDING_ELECTRICITY_LABEL,
  PENDING_OTHER_LABEL,
  type DaysPaidDisplayRow,
  type SettlementDisplaySection,
} from '@/src/lib/checkout/settlementDisplayFormat';
import { paiseToInr } from '@/src/lib/format';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
import { buildSettlementBillingDatesSectionRows } from '@/src/lib/vacating/settlementBillingRows';
import { buildVacatingSettlementPreview } from '@/src/lib/vacating/computeVacatingSettlementPreview';

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
  return buildVacatingSettlementPreview(input, opts);
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
    /** From checkout detail loader — BillingCoverageModel SSOT. */
    settlementNoticeDisplay?: NoticeSettlementDisplay | null;
    billingCoverageDaysPaid?: DaysPaidDisplayRow;
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

  const notice = args.detail.settlementNoticeDisplay ?? null;

  const w = args.waterfall;
  const dailyRentPaise = w.rentBucket.dailyRentPaise;
  const daysPaid = args.detail.billingCoverageDaysPaid ?? { value: '—' };
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
        rows: buildSettlementBillingDatesSectionRows({
          notice,
          vacatingDate: args.detail.vacatingDate,
          stayDays: w.stay.stayDays,
          checkInDate: w.stay.checkInDate,
          checkoutDate: w.stay.checkoutDate,
          daysPaid,
        }),
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
          ...(w.depositBucket.tailRentPaise > 0
            ? [
                {
                  id: 'tail_rent_through_vacate',
                  label: 'Rent through vacate date',
                  value: formatSettlementPaise(w.depositBucket.tailRentPaise, true),
                  deduct: true,
                },
              ]
            : []),
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
